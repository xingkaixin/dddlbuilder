import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import * as icons from '@/components/icons';

describe('Hugeicons adapter', () => {
  it('renders every exported application icon', () => {
    expect(Object.keys(icons)).toHaveLength(110);

    for (const [name, Icon] of Object.entries(icons)) {
      const markup = renderToStaticMarkup(
        createElement(Icon, {
          'aria-label': name,
          className: 'h-4 w-4',
        }),
      );

      expect(markup).toContain('<svg');
      expect(markup).toContain(`aria-label="${name}"`);
      expect(markup).toContain('stroke-width="1.7"');
    }
  });
});
