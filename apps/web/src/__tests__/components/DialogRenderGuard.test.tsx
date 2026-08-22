import { describe, expect, it, vi } from 'vitest';
import { render } from '@/__tests__/utils/test-utils';
import { DialogRenderGuard } from '@/components/App/containers/DialogRenderGuard';

describe('DialogRenderGuard', () => {
  it('关闭时不挂载子组件，重新打开时使用最新属性', () => {
    const Child = vi.fn(({ value }: { value: string }) => <span>{value}</span>);
    const { rerender } = render(
      <DialogRenderGuard open={false}>
        <Child value="initial" />
      </DialogRenderGuard>,
    );

    rerender(
      <DialogRenderGuard open={false}>
        <Child value="hidden update" />
      </DialogRenderGuard>,
    );
    expect(Child).not.toHaveBeenCalled();

    rerender(
      <DialogRenderGuard open>
        <Child value="opened" />
      </DialogRenderGuard>,
    );
    expect(Child).toHaveBeenCalledTimes(1);

    rerender(
      <DialogRenderGuard open={false}>
        <Child value="closing" />
      </DialogRenderGuard>,
    );
    rerender(
      <DialogRenderGuard open={false}>
        <Child value="closed update" />
      </DialogRenderGuard>,
    );
    expect(Child).toHaveBeenCalledTimes(1);
  });
});
