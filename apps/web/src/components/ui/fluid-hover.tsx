import { useCallback, useEffect, useRef, type ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const itemSelector =
  '[role="tab"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]';
const disabledSelector = ':disabled, [aria-disabled="true"], [data-disabled]';

type ItemBox = { element: HTMLElement; left: number; top: number; width: number; height: number };

// Adapted from https://www.fluidfunctionalism.com/docs/fluid-hover:
// nearest-item hover, with native CSS travel and no gap-click forwarding.
export function FluidHover({ className, children, ref, ...props }: ComponentProps<'div'>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);

  const mergedRef = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;

      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- this boundary value requires a runtime representation check.
      if (typeof ref === 'function') return ref(node);

      if (ref) ref.current = node;
    },
    [ref],
  );

  useEffect(() => {
    const container = containerRef.current;
    const highlight = highlightRef.current;

    if (!container || !highlight) return;
    let items: ItemBox[] = [];
    let contentBounds = { left: 0, top: 0, right: 0, bottom: 0 };
    let active: HTMLElement | null = null;
    let pointer: { x: number; y: number } | null = null;
    let frame = 0;
    const mouseQuery = window.matchMedia('(hover: hover) and (pointer: fine)');

    const clear = () => {
      pointer = null;
      cancelAnimationFrame(frame);
      active?.removeAttribute('data-fluid-hover-active');
      active = null;
      container.removeAttribute('data-fluid-hovering');
    };

    const measure = () => {
      items = Array.from(container.querySelectorAll<HTMLElement>(itemSelector))
        .filter((element) => element.closest('[data-fluid-hover]') === container)
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => {
          let left = element.offsetLeft;
          let top = element.offsetTop;
          // SAFETY: browser offsetParent values provide the HTMLElement offset metrics used below.
          let parent = element.offsetParent as HTMLElement | null;

          while (parent && parent !== container && container.contains(parent)) {
            left += parent.offsetLeft + parent.clientLeft;
            top += parent.offsetTop + parent.clientTop;
            // SAFETY: this continues the HTMLElement offsetParent chain established above.
            parent = parent.offsetParent as HTMLElement | null;
          }

          return { element, left, top, width: element.offsetWidth, height: element.offsetHeight };
        });
      contentBounds = {
        left: Math.min(...items.map((item) => item.left)),
        top: Math.min(...items.map((item) => item.top)),
        right: Math.max(...items.map((item) => item.left + item.width)),
        bottom: Math.max(...items.map((item) => item.top + item.height)),
      };
    };

    const draw = () => {
      if (!pointer) return;
      const bounds = container.getBoundingClientRect();
      const scaleX = bounds.width / container.offsetWidth || 1;
      const scaleY = bounds.height / container.offsetHeight || 1;
      const x = (pointer.x - bounds.left) / scaleX + container.scrollLeft - container.clientLeft;
      const y = (pointer.y - bounds.top) / scaleY + container.scrollTop - container.clientTop;

      if (
        x < contentBounds.left ||
        x > contentBounds.right ||
        y < contentBounds.top ||
        y > contentBounds.bottom
      ) {
        clear();

        return;
      }

      const horizontal = container.getAttribute('data-orientation') === 'horizontal';
      let nearest: ItemBox | undefined;
      let distance = Infinity;

      for (const item of items) {
        if (item.element.matches(disabledSelector)) continue;
        const start = horizontal ? item.left : item.top;
        const size = horizontal ? item.width : item.height;
        const position = horizontal ? x : y;

        const nextDistance =
          position >= start && position <= start + size ? 0 : Math.abs(position - start - size / 2);

        if (nextDistance < distance) {
          distance = nextDistance;
          nearest = item;
        }
      }

      if (!nearest) {
        clear();

        return;
      }

      active?.removeAttribute('data-fluid-hover-active');
      active = nearest.element;
      active.setAttribute('data-fluid-hover-active', '');
      highlight.style.transform = `translate(${nearest.left}px, ${nearest.top}px)`;
      highlight.style.width = `${nearest.width}px`;
      highlight.style.height = `${nearest.height}px`;

      if (!container.hasAttribute('data-fluid-hovering')) {
        // Commit the entry position before enabling travel, including after keyboard use.
        highlight.getBoundingClientRect();
        container.setAttribute('data-fluid-hovering', '');
      }
    };

    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || !mouseQuery.matches) {
        clear();

        return;
      }

      if (!(event.target instanceof Element)) {
        clear();

        return;
      }

      const target = event.target;

      if (target.closest('[data-fluid-hover]') !== container) {
        clear();

        return;
      }

      if (!pointer) measure();
      pointer = { x: event.clientX, y: event.clientY };
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    };
    const focus = (event: FocusEvent) => {
      if (event.target instanceof Element && event.target.matches(':focus-visible')) clear();
    };
    const refresh = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        measure();
        clear();
      });
    };
    const resize = new ResizeObserver(refresh);

    const observeItems = () => {
      resize.disconnect();
      resize.observe(container);
      container.querySelectorAll<HTMLElement>(itemSelector).forEach((item) => resize.observe(item));
      refresh();
    };
    const mutation = new MutationObserver(observeItems);
    mutation.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled', 'aria-disabled', 'data-disabled', 'hidden'],
    });
    observeItems();
    container.addEventListener('pointermove', move);
    container.addEventListener('pointerleave', clear);
    container.addEventListener('pointercancel', clear);
    container.addEventListener('keydown', clear, true);
    container.addEventListener('focusin', focus);
    container.addEventListener('scroll', clear, true);
    mouseQuery.addEventListener('change', clear);

    return () => {
      clear();
      resize.disconnect();
      mutation.disconnect();
      container.removeEventListener('pointermove', move);
      container.removeEventListener('pointerleave', clear);
      container.removeEventListener('pointercancel', clear);
      container.removeEventListener('keydown', clear, true);
      container.removeEventListener('focusin', focus);
      container.removeEventListener('scroll', clear, true);
      mouseQuery.removeEventListener('change', clear);
    };
  }, []);

  return (
    <div
      {...props}
      ref={mergedRef}
      data-fluid-hover=""
      className={cn('relative isolate', className)}
    >
      <div ref={highlightRef} aria-hidden="true" data-slot="fluid-hover-highlight" />
      {children}
    </div>
  );
}
