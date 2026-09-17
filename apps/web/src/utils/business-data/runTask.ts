import i18n from '@/i18n';
import type { BusinessDataReply, BusinessDataTask, BusinessDataTaskResult } from './tasks';

export function runBusinessDataTask(
  task: BusinessDataTask,
  signal: AbortSignal,
): Promise<BusinessDataTaskResult> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));

      return;
    }

    const worker = new Worker(new URL('./businessData.worker.ts', import.meta.url), {
      type: 'module',
    });
    const release = () => {
      worker.terminate();
      signal.removeEventListener('abort', cancel);
    };
    const cancel = () => {
      release();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', cancel, { once: true });
    worker.onmessage = (event: MessageEvent<BusinessDataReply>) => {
      release();

      if ('error' in event.data) reject(new Error(event.data.error));
      else resolve(event.data.output);
    };

    worker.onerror = () => {
      release();
      reject(new Error('dataImport.errors.read'));
    };

    try {
      worker.postMessage({ task, locale: i18n.resolvedLanguage ?? 'zh-CN' });
    } catch (cause) {
      release();
      reject(cause);
    }
  });
}
