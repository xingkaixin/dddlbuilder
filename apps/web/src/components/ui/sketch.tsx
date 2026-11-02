import { useCallback, useId } from 'react';
import { inkMarkup } from '@ddlbuilder/design/ink';

const drawers = new WeakMap<Element, () => void>();

const observer = new ResizeObserver((entries) => {
  for (const entry of entries) drawers.get(entry.target)?.();
});

interface InkProps {
  radius?: number;
  wash?: boolean;
}

export function Ink({ radius, wash }: InkProps) {
  const id = useId().replace(/\W/g, '');

  const attach = useCallback(
    (svg: SVGSVGElement) => {
      const host = svg.parentElement;

      if (!host) return;

      drawers.set(host, () => {
        const { offsetWidth: width, offsetHeight: height } = host;

        if (width < 2 || height < 2) return;

        svg.setAttribute('width', String(width));
        svg.setAttribute('height', String(height));
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        svg.innerHTML = inkMarkup({ id, seedText: id, width, height, radius, wash });
      });
      observer.observe(host);

      return () => {
        observer.unobserve(host);
        drawers.delete(host);
      };
    },
    [id, radius, wash],
  );

  return <svg ref={attach} className="lm-ink" aria-hidden="true" />;
}
