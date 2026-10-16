import { createWorkerBackgroundLogger } from './logging.js';
import { readSessionAccess } from './auth.js';
import { mergeReviewSuggestions } from './aiReviewProjection.js';
import { DDLReviewSuggestionSchema } from '@ddlbuilder/shared-types/ddl-review';
import * as Schema from 'effect/Schema';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import {
  Harness,
  hook,
  GenerationTask,
  LiveDoc,
  createRegistry,
  defineDoc,
  type Conversation,
  type ConversationId,
  type Storage,
  type SubmissionRecord,
} from '@earendil-works/pi-durable';
import { openDurableObjectSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/cloudflare';
import type { AssistantMessage } from '@earendil-works/pi-ai';
import type { JsonValue } from '@earendil-works/chord';
import * as Effect from 'effect/Effect';
import {
  AI_CONTEXT_LIMIT_ERROR,
  AIConversationSnapshotSchema,
  type AIConversationSnapshot,
} from '@ddlbuilder/shared-types';
import type { ApiEnv } from './context.js';
import type { AIRouteKey } from './aiRouteKey.js';
import { prepareAIScenario } from './aiScenarios.js';
import { createAIConversationModels } from './aiConversationModels.js';
import { loadAIConversationConfig, AI_RETENTION_MS } from './aiConversationConfig.js';
import {
  type AIUsageReceipt,
  assertAIOperationAccess,
  readAIOperation,
  recordAICallUsage,
  settleAICalls,
} from './aiConversationUsage.js';

const context = BACKGROUND_CONTEXT;

type Operation = {
  id: string;
  conversationId: string;
  route: AIRouteKey;
  body: JsonValue;
  model: string;
  instructions: string;
  input: string;
  maxTokens: number;
  thinking: boolean;
  thinkingLevel: 'low' | 'medium' | 'high';
  text: string;
  result: JsonValue;
  error: string | null;
  status: 'running' | 'succeeded' | 'failed' | 'cancelled';
  accountingPending: boolean;
};

const State = defineDoc<{ conversation: number | null; operation: Operation | null }>({
  kind: 'ddl.ai.state',
  version: 1,
  scope: 'session',
  initial: () => ({ conversation: null, operation: null }),
});
const Receipts = defineDoc<{
  items: ({ id: string; tokens: number; outputChars: number } & AIUsageReceipt)[];
}>({
  kind: 'ddl.ai.receipts',
  version: 1,
  scope: 'session',
  initial: () => ({ items: [] }),
});

const Results = defineDoc<{ items: { id: string; snapshot: JsonValue }[] }>({
  kind: 'ddl.ai.results',
  version: 1,
  scope: 'session',
  initial: () => ({ items: [] }),
});

const ReviewProjection = defineDoc<{ text: string; operationId: string; suggestions: string }>({
  kind: 'ddl.ai.review',
  version: 1,
  scope: 'session',
  initial: () => ({ text: '', operationId: '', suggestions: '[]' }),
});

export class AIConversationDurableObject {
  private harness?: Harness;
  private storage?: Storage;
  private conversation?: Conversation;
  private running?: Promise<void>;
  private projection = Promise.resolve();
  private readonly observers = new Set<() => void>();
  private readonly ready: Promise<void>;

  private readonly ctx: DurableObjectState;
  private readonly env: ApiEnv['Bindings'];

  constructor(ctx: DurableObjectState, env: ApiEnv['Bindings']) {
    this.ctx = ctx;
    this.env = env;
    this.ready = ctx.blockConcurrencyWhile(() => this.initialize());
  }

  private async initialize() {
    const storage = await openDurableObjectSqliteStorage(this.ctx.storage);
    this.storage = storage;

    const models = await createAIConversationModels(
      this.env,
      async () => {
        await this.replayReceipts();
        const state = await this.state();

        if (!state.operation) throw new Error('AI operation missing');

        return {
          operationId: state.operation.id,
          route: state.operation.route,
          scenario: {
            ...prepareAIScenario(state.operation.route, state.operation.body),
            instructions: state.operation.instructions,
            input: state.operation.input,
            maxTokens: state.operation.maxTokens,
          },
          thinking: state.operation.thinking,
        };
      },
      (id, response, receipt) => this.saveUsage(id, response, receipt),
      (promise) => this.ctx.waitUntil(promise),
    );
    const registry = createRegistry();
    registry.install({
      name: 'ddl.review',
      hooks: [
        hook(GenerationTask, {
          beforeRequest: async (request) => {
            const projection = await this.runtime().harness.snapshot(ReviewProjection, context);
            const { operation } = await this.state();

            if (
              !projection ||
              projection.operationId !== operation?.id ||
              projection.suggestions === '[]'
            )
              return;

            return {
              messages: [
                ...request.messages,
                {
                  role: 'user' as const,
                  content: `Persisted review suggestions: ${projection.suggestions}\nKeep existing IDs when updating the same suggestion. Return the complete current review JSON.`,
                  timestamp: Date.now(),
                },
              ],
            };
          },
        }),
      ],
    });
    this.harness = await Harness.open(
      storage,
      {
        registry,
        models,
        settings: {
          stream: { timeoutMs: 120_000, maxRetries: 0 },
          retry: { maxRetries: 1 },
          compaction: { enabled: false },
          progress: { partialIntervalMs: 100 },
        },
      },
      context,
    );
    const state = await this.state();

    if (state.conversation !== null)
      this.conversation = await this.harness.conversation(
        // SAFETY: this ID was persisted from harness.createConversation in this same SQLite store.
        state.conversation as ConversationId,
        context,
      );
    this.harness.subscribeCommits(() => {
      this.ctx.waitUntil(this.projectReview());

      for (const listener of this.observers) listener();
    });
  }

  private projectReview() {
    const next = this.projection.then(async () => {
      const { operation } = await this.state();

      if (operation?.route !== 'review') return;
      const message = await this.message();

      const text =
        message?.content
          .filter((item) => item.type === 'text')
          .map((item) => item.text)
          .join('') ?? '';
      const previous = await this.runtime().harness.snapshot(ReviewProjection, context);

      if (previous?.operationId === operation.id && previous.text === text) return;

      const items = Schema.decodeUnknownSync(Schema.Array(DDLReviewSuggestionSchema))(
        JSON.parse(previous?.operationId === operation.id ? previous.suggestions : '[]'),
      );
      const suggestions = mergeReviewSuggestions(items, text);
      await this.runtime().harness.commit(async (tx) => {
        const doc = await tx.doc(ReviewProjection);
        doc.operationId = operation.id;
        doc.text = text;
        doc.suggestions = JSON.stringify(suggestions);
      }, context);
    });
    this.projection = next.catch(() => undefined);

    return next;
  }

  private runtime() {
    if (!this.harness || !this.storage) throw new Error('AI runtime unavailable');

    return { harness: this.harness, storage: this.storage };
  }

  private async state() {
    const { harness } = this.runtime();

    return (await harness.snapshot(State, context)) ?? { conversation: null, operation: null };
  }

  private async saveUsage(
    id: string,
    response: AssistantMessage,
    kind: 'complete' | 'partial' | 'rejected',
  ) {
    const complete = kind !== 'partial';
    const succeeded = kind === 'complete' && response.stopReason === 'stop';

    const usage = {
      complete,
      succeeded,
      inputTokens: response.usage.input,
      outputTokens: response.usage.output,
      cacheReadTokens: response.usage.cacheRead,
      cacheWriteTokens: response.usage.cacheWrite,
    };

    const outputChars = response.content.reduce(
      (total, item) =>
        total +
        (item.type === 'text'
          ? item.text.length
          : item.type === 'thinking'
            ? item.thinking.length
            : 0),
      0,
    );
    await this.runtime().harness.commit(async (tx) => {
      const receipts = await tx.doc(Receipts);

      if (!receipts.items.some((item) => item.id === id))
        receipts.items.push({
          id,
          tokens: response.usage.totalTokens,
          outputChars,
          ...usage,
        });
    }, context);
    // The durable receipt is replayed before the next admission and before settlement.
    await recordAICallUsage(this.env, id, response.usage.totalTokens, outputChars, usage).catch(
      () => {
        const log = createWorkerBackgroundLogger(
          { job: { name: 'ai-usage-receipt' }, ai: { callId: id, outcome: 'replay_pending' } },
          (promise) => this.ctx.waitUntil(promise),
          this.env.ENVIRONMENT,
        );
        log.error(new Error('AI usage receipt sync deferred'));
        log.emit();
      },
    );
  }

  private async replayReceipts() {
    const receipts = await this.runtime().harness.snapshot(Receipts, context);

    for (const item of receipts?.items ?? [])
      await recordAICallUsage(this.env, item.id, item.tokens, item.outputChars, item);
  }

  private async settle(operation: Operation) {
    await this.replayReceipts();
    await settleAICalls(this.env, operation.id, operation.route, operation.status === 'succeeded');
    await this.env.USER_DB.prepare('UPDATE ai_operations SET completed_at = ? WHERE id = ?')
      .bind(Date.now(), operation.id)
      .run();
    const snapshot = { ...(await this.snapshot()), accountingPending: false };
    await this.runtime().harness.commit(async (tx) => {
      const state = await tx.doc(State);

      if (state.operation?.id === operation.id) state.operation.accountingPending = false;
      (await tx.doc(Receipts)).items = [];
      const results = await tx.doc(Results);
      results.items = results.items.filter((item) => item.id !== operation.id);
      results.items.push({ id: operation.id, snapshot: JSON.parse(JSON.stringify(snapshot)) });
    }, context);
    await this.ctx.storage.setAlarm(Date.now() + AI_RETENTION_MS);
  }

  private async latest(): Promise<SubmissionRecord | undefined> {
    if (!this.conversation) return undefined;

    return (
      await this.runtime().storage.scanSubmissions(
        { conversationId: this.conversation.id, order: 'descending' },
        1,
        undefined,
        context,
      )
    ).items[0];
  }

  private async message() {
    if (!this.conversation) return undefined;
    const submission = await this.latest();

    if (submission?.requestId !== (await this.state()).operation?.id) return undefined;
    const live = await this.runtime().harness.snapshot(LiveDoc, this.conversation.id, context);

    if (live?.generation?.message) return live.generation.message;
    if (!submission?.entry) return undefined;

    const entries = await this.runtime().storage.scanEntries(
      { conversationId: this.conversation.id, minEntryId: submission.entry, order: 'descending' },
      100,
      undefined,
      context,
    );

    return entries.items
      .flatMap((entry) => entry.model ?? [])
      .find((item) => item.role === 'assistant');
  }

  private start() {
    if (this.running) return;

    const task = this.execute()
      .catch(async () => {
        const { operation } = await this.state();

        const log = createWorkerBackgroundLogger(
          {
            job: { name: 'ai-conversation-recovery' },
            ai: {
              operationId: operation?.id,
              conversationId: operation?.conversationId,
              outcome: 'recovery_pending',
            },
          },
          (promise) => this.ctx.waitUntil(promise),
          this.env.ENVIRONMENT,
        );
        log.error(new Error('AI operation requires durable recovery'));
        log.emit();
        throw new Error('AI operation requires durable recovery');
      })
      .finally(() => {
        this.running = undefined;

        for (const listener of this.observers) listener();
      });
    this.running = task;
    this.ctx.waitUntil(task);
  }

  private async execute() {
    const state = await this.state();
    const operation = state.operation;

    if (!operation || !this.conversation) return;

    if (operation.status !== 'running') {
      if (operation.accountingPending) await this.settle(operation);

      return;
    }

    const access = await readAIOperation(this.env, operation.id);

    if (!access) throw new Error('AI operation missing');

    if (access.stopped_at || access.completed_at || (access.deadline_at ?? 0) <= Date.now()) {
      await this.conversation.abort(context);
    } else {
      await assertAIOperationAccess(this.env, access).catch(async () => {
        await this.env.USER_DB.prepare('UPDATE ai_operations SET stopped_at = ? WHERE id = ?')
          .bind(Date.now(), operation.id)
          .run();
        await this.conversation?.abort(context);
      });

      if ((await readAIOperation(this.env, operation.id))?.stopped_at) {
        await this.finishCancelled(operation);

        return;
      }

      await this.conversation.configure(
        {
          model: { provider: 'anthropic', modelId: operation.model },
          thinkingLevel: operation.thinking ? operation.thinkingLevel : 'off',
          instructions: operation.instructions,
          tools: [],
        },
        context,
      );

      const submission = await this.conversation.submit(
        { type: 'input', content: operation.input, requestId: operation.id, whenBusy: 'reject' },
        context,
      );
      await submission.wait(context);
    }

    const submission = await this.latest();
    const response = await this.message();

    let text =
      response?.content
        .filter((item) => item.type === 'text')
        .map((item) => item.text)
        .join('') ?? '';
    await this.projectReview();
    const current = await readAIOperation(this.env, operation.id);
    let status: Operation['status'] = current?.stopped_at ? 'cancelled' : 'failed';
    let result: JsonValue = null;

    let error: string | null =
      status === 'cancelled'
        ? 'AI operation cancelled'
        : response?.errorMessage === AI_CONTEXT_LIMIT_ERROR
          ? AI_CONTEXT_LIMIT_ERROR
          : 'AI generation failed';

    if (
      submission?.status === 'done' &&
      response?.stopReason === 'stop' &&
      status !== 'cancelled'
    ) {
      try {
        const scenario = prepareAIScenario(operation.route, operation.body);

        const canonical = scenario.outputSchema
          ? JSON.stringify(
              Schema.decodeUnknownSync(Schema.toCodecJson(Schema.toType(scenario.outputSchema)))(
                JSON.parse(text),
              ),
            )
          : text;
        result = JSON.parse(JSON.stringify(scenario.decode(canonical)));

        if (scenario.outputSchema) text = JSON.stringify(result);
        status = 'succeeded';
        error = null;
      } catch {
        error = 'AI output validation failed';
      }
    }

    await this.runtime().harness.commit(async (tx) => {
      const state = await tx.doc(State);

      if (state.operation?.id !== operation.id)
        throw new Error('AI operation changed during execution');
      Object.assign(state.operation, { text, result, status, error });
    }, context);
    await this.settle({ ...operation, text, result, status, error });

    const log = createWorkerBackgroundLogger(
      {
        job: { name: 'ai-conversation' },
        ai: {
          operationId: operation.id,
          conversationId: operation.conversationId,
          route: operation.route,
          model: operation.model,
          thinkingEnabled: operation.thinking,
          outcome: status,
          accountingFinalized: true,
        },
      },
      (promise) => this.ctx.waitUntil(promise),
      this.env.ENVIRONMENT,
    );
    log.emit();
  }

  private async finishCancelled(operation: Operation) {
    const message = await this.message();

    const text =
      message?.content
        .filter((item) => item.type === 'text')
        .map((item) => item.text)
        .join('') ?? operation.text;
    await this.runtime().harness.commit(async (tx) => {
      const state = await tx.doc(State);

      if (state.operation?.id === operation.id) {
        state.operation.text = text;
        state.operation.status = 'cancelled';
        state.operation.error = 'AI operation cancelled';
      }
    }, context);
    await this.settle({ ...operation, text, status: 'cancelled' });
  }

  private async snapshot(): Promise<AIConversationSnapshot> {
    const { operation } = await this.state();

    if (!operation) throw new Error('AI operation not submitted');
    const message = operation.status === 'running' ? await this.message() : undefined;
    const projection = await this.runtime().harness.snapshot(ReviewProjection, context);

    return {
      operationId: operation.id,
      conversationId: operation.conversationId,
      status: operation.status,
      text:
        message?.content
          .filter((item) => item.type === 'text')
          .map((item) => item.text)
          .join('') ?? operation.text,
      thinking:
        operation.status === 'running'
          ? (message?.content
              .filter((item) => item.type === 'thinking')
              .map((item) => item.thinking)
              .join('\n') ?? '')
          : '',
      suggestions: Schema.decodeUnknownSync(Schema.Array(DDLReviewSuggestionSchema))(
        JSON.parse(projection?.operationId === operation.id ? projection.suggestions : '[]'),
      ),
      result: operation.result,
      error: operation.error,
      accountingPending: operation.accountingPending,
    };
  }

  async fetch(request: Request) {
    await this.ready;
    const url = new URL(request.url);
    const operationId = url.searchParams.get('operation');
    const userId = request.headers.get('x-ai-user');
    const operation = operationId ? await readAIOperation(this.env, operationId) : null;

    if (!operation || operation.user_id !== userId)
      return new Response('Not found', { status: 404 });

    if (url.pathname === '/delete') {
      await this.ctx.storage.setAlarm(Date.now() + 1);

      return Response.json({ deleting: true });
    }

    if ((await this.state()).operation?.id !== operationId) {
      const saved = (await this.runtime().harness.snapshot(Results, context))?.items.find(
        (item) => item.id === operationId,
      );

      if (saved) {
        const snapshot = Schema.decodeUnknownSync(AIConversationSnapshotSchema)(saved.snapshot);

        return url.pathname === '/events'
          ? new Response(JSON.stringify(snapshot) + '\n', {
              headers: { 'Content-Type': 'application/x-ndjson' },
            })
          : Response.json(snapshot);
      }
    }

    if (request.method === 'POST' && url.pathname === '/submit') {
      const body: { route: AIRouteKey; input: JsonValue } = await request.json();
      const state = await this.state();

      if (state.operation?.id !== operation.id) {
        if (
          state.operation &&
          (state.operation.status === 'running' || state.operation.accountingPending)
        )
          return new Response('Conversation busy', { status: 409 });

        if (this.running) await this.running;
        await assertAIOperationAccess(this.env, operation);
        const config = await Effect.runPromise(loadAIConversationConfig(this.env));

        if (!this.conversation)
          this.conversation = await this.runtime().harness.createConversation(
            { ownership: { kind: 'ownerless' } },
            context,
          );
        const conversation = this.conversation;
        const scenario = prepareAIScenario(body.route, body.input);
        await this.runtime().harness.commit(async (tx) => {
          const state = await tx.doc(State);
          state.conversation = conversation.id;
          state.operation = {
            id: operation.id,
            conversationId: operation.conversation_id,
            route: body.route,
            body: body.input,
            model: config.model,
            instructions: scenario.instructions,
            input: scenario.input,
            maxTokens: scenario.maxTokens,
            thinking: config.thinking,
            thinkingLevel: config.thinkingLevel,
            text: '',
            result: null,
            error: null,
            status: 'running',
            accountingPending: true,
          };
        }, context);
      }

      await this.ctx.storage.setAlarm(Date.now() + 30_000);
      this.start();

      return Response.json(await this.snapshot());
    }

    if ((await this.state()).operation?.id !== operationId)
      return new Response('Operation no longer current', { status: 409 });

    if (url.pathname === '/stop') {
      await this.env.USER_DB.prepare(
        'UPDATE ai_operations SET stopped_at = COALESCE(stopped_at, ?) WHERE id = ?',
      )
        .bind(Date.now(), operation.id)
        .run();
      await this.conversation?.abort(context);

      if (this.running) await this.running;
      this.start();
    } else this.start();

    if (url.pathname === '/events') return this.events(request.signal);

    return Response.json(await this.snapshot());
  }

  private events(signal: AbortSignal) {
    const encoder = new TextEncoder();
    let wake: (() => void) | undefined;
    const changed = () => wake?.();
    this.observers.add(changed);
    let cancelled = false;

    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        const observe = async () => {
          let previous = '';
          let checkedAt = 0;

          try {
            while (!signal.aborted && !cancelled) {
              const change = new Promise<void>((resolve) => {
                wake = resolve;
              });

              if (Date.now() - checkedAt >= 15_000) {
                const { operation } = await this.state();
                const access = operation ? await readAIOperation(this.env, operation.id) : null;

                if (!access) throw new Error('AI operation unavailable');
                const authorization = await readSessionAccess(this.env, access.user_id);

                if (!authorization.sessionIds.has(access.session_id))
                  throw new Error('AI authorization expired');
                checkedAt = Date.now();
              }

              const snapshot = await this.snapshot();
              const json = JSON.stringify(snapshot);

              if (json !== previous) controller.enqueue(encoder.encode(json + '\n'));
              previous = json;

              if (snapshot.status !== 'running') break;
              const timer = setTimeout(changed, 15_000);

              try {
                await change;
              } finally {
                clearTimeout(timer);
              }
            }

            if (!cancelled) controller.close();
          } catch (error) {
            if (!cancelled) controller.error(error);
          } finally {
            this.observers.delete(changed);
          }
        };
        this.ctx.waitUntil(observe());
      },
      cancel: () => {
        cancelled = true;
        this.observers.delete(changed);
        changed();
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' },
    });
  }

  async alarm() {
    await this.ready;
    const { operation } = await this.state();

    if (!operation) {
      await this.ctx.storage.deleteAll();

      return;
    }

    if (operation.status !== 'running' && !operation.accountingPending) {
      const retention = await this.env.USER_DB.prepare(
        'SELECT expires_at, deleted_at FROM ai_conversations WHERE id = ?',
      )
        .bind(operation.conversationId)
        .first<{ expires_at: number; deleted_at: number | null }>();

      if (retention && !retention.deleted_at && retention.expires_at > Date.now()) {
        await this.ctx.storage.setAlarm(retention.expires_at);

        return;
      }

      await this.runtime().harness.close(context);
      await this.ctx.storage.deleteAll();
      await this.env.USER_DB.prepare('UPDATE ai_conversations SET deleted_at = ? WHERE id = ?')
        .bind(Date.now(), operation.conversationId)
        .run();

      return;
    }

    await this.ctx.storage.setAlarm(Date.now() + 30_000);
    const access = await readAIOperation(this.env, operation.id);

    if (!access) {
      await this.conversation?.abort(context);
      await this.runtime().harness.close(context);
      await this.ctx.storage.deleteAll();

      return;
    }

    if (access) {
      try {
        await assertAIOperationAccess(this.env, access);
      } catch {
        await this.env.USER_DB.prepare(
          'UPDATE ai_operations SET stopped_at = COALESCE(stopped_at, ?) WHERE id = ?',
        )
          .bind(Date.now(), operation.id)
          .run();
        await this.conversation?.abort(context);
      }
    }

    this.start();
    await this.running;
  }
}
