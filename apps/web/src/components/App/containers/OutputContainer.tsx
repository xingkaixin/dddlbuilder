import { memo, type ComponentProps } from 'react';
import { DDLOutput } from '../DDLOutput';

export interface OutputContainerProps {
  ddlOutputProps: ComponentProps<typeof DDLOutput>;
  onCollapse?: () => void;
  onMaximize?: () => void;
}

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
});
