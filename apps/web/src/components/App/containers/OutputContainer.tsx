import { memo, type ComponentProps } from 'react';
import { DDLOutput } from '../DDLOutput';

export interface OutputContainerProps {
  ddlOutputProps: ComponentProps<typeof DDLOutput>;
  onCollapse?: () => void;
}

export const OutputContainer = memo(function OutputContainer({
  ddlOutputProps,
  onCollapse,
}: OutputContainerProps) {
  return (
    <div className="xl:w-[34rem] xl:shrink-0 2xl:w-[38rem]" data-testid="output-panel">
      <DDLOutput {...ddlOutputProps} onCollapsePanel={onCollapse} />
    </div>
  );
});
