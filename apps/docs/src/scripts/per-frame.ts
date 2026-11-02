export function perFrame(callback: () => void): () => void {
  let queued = false;

  return () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      callback();
    });
  };
}
