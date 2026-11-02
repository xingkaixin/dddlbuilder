const PLAY_DURATION_MS = 3000;
const HOVER_REPLAY_DELAY_MS = 600;
const BLUR_DURATION_MS = 160;
const VISIBLE_RATIO = 0.7;

export function attachTilePlayer(node: HTMLElement, order = 0): () => void {
  node.setAttribute('data-armed', '');

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    node.setAttribute('data-played', '');

    return () => {};
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  let playing = false;
  let hovered = false;

  function play() {
    playing = true;
    node.removeAttribute('data-played');
    // Removing and re-adding the attribute in one frame would not restart the CSS animations.
    void node.offsetWidth;
    node.setAttribute('data-played', '');
    clearTimeout(timer);
    timer = setTimeout(() => {
      playing = false;

      if (hovered) timer = setTimeout(replay, HOVER_REPLAY_DELAY_MS);
    }, PLAY_DURATION_MS);
  }

  function replay() {
    if (playing || !node.hasAttribute('data-played')) return;
    node.setAttribute('data-blur', '');
    timer = setTimeout(() => {
      play();
      node.removeAttribute('data-blur');
    }, BLUR_DURATION_MS);
  }

  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries[0]?.isIntersecting) return;
      observer.disconnect();
      timer = setTimeout(play, 200 + order * 250);
    },
    { threshold: VISIBLE_RATIO },
  );
  observer.observe(node);

  function onPointerEnter(event: PointerEvent) {
    if (event.pointerType !== 'mouse') return;
    hovered = true;
    replay();
  }

  function onPointerLeave() {
    hovered = false;
  }

  node.addEventListener('pointerenter', onPointerEnter);
  node.addEventListener('pointerleave', onPointerLeave);
  node.addEventListener('focusin', replay);

  return () => {
    clearTimeout(timer);
    observer.disconnect();
    node.removeEventListener('pointerenter', onPointerEnter);
    node.removeEventListener('pointerleave', onPointerLeave);
    node.removeEventListener('focusin', replay);
  };
}
