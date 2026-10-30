# Web state has one owner per source

The web app assigns each piece of state to exactly one owner, chosen by where its source of truth
lives. Asynchronous reads and writes against the Worker API or IndexedDB belong to TanStack Query.
The Workspace Document and other push-based sources, such as browser APIs and the URL, are read
through `useSyncExternalStore` or projected into a store by an adapter, and the projection never
becomes a second authority. Client state shared across components, including the editor's
projection of the Workspace Document, the Editor Session, global UI and device-local preferences,
lives in zustand. State owned by a single component lives in `useReducer` instead of separate
`useState` calls, with statuses modeled as discriminated unions and every transition inside the
reducer. AI generation streams are user-triggered and charged, so they are not queries; their
per-request lifecycle lives in a reducer. No owner keeps a copy of data owned by another.
Components do not use `useEffect` to fetch data, mirror props or derived values into state, or run
side effects in response to state changes; those belong to queries, render-time derivation, `key`
resets and event handlers. Effects remain only in adapters that synchronize with external systems.

## Considered Options

XState was considered for asynchronous workflows with timeouts, cancellation and parallel
sub-states, with workspace bootstrap and sync as the main candidate. We rejected it for now because
one candidate does not justify a new dependency and a second way to write state machines; a reducer
with discriminated unions, plus a single place that owns async work, timeouts and cancellation,
covers the current workflows. Revisit this when a reducer accumulates parallel sub-states or its
timers and cancellation become hard to maintain.

## Consequences

Existing components that keep state in `useState` or react to changes in `useEffect` migrate
incrementally; new code follows this decision.
