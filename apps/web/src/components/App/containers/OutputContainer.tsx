import { memo, type ComponentProps } from 'react';
import { DDLOutput } from '../DDLOutput';

export interface OutputContainerProps {
  ddlOutputProps: ComponentProps<typeof DDLOutput>;
  onCollapse?: () => void;
  onMaximize?: () => void;
  frozen?: boolean;
}

// 隐藏时保持挂载以保留输出标签和滚动位置，但跳过重渲染，避免在设计视图里反复着色 SQL。
const isOutputUnchanged = (previous: OutputContainerProps, next: OutputContainerProps) =>
  next.frozen === true ||
  (previous.ddlOutputProps === next.ddlOutputProps &&
    previous.onCollapse === next.onCollapse &&
    previous.onMaximize === next.onMaximize &&
    previous.frozen === next.frozen);

export const OutputContainer = memo(function OutputContainer({
  ddlOutputProps,
  onCollapse,
  onMaximize,
}: OutputContainerProps) {
  return (
    <div className="min-w-0" data-testid="output-panel">
      <DDLOutput {...ddlOutputProps} onCollapsePanel={onCollapse} onMaximizePanel={onMaximize} />
    </div>
  );
}, isOutputUnchanged);
