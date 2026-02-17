export function buildShareStateQueryKey(shareId: string) {
  return ['share-state', shareId] as const;
}
