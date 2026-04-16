import type { ComponentProps } from 'react';
import { DDLOutput } from '../DDLOutput';

interface OutputContainerProps {
  ddlOutputProps: ComponentProps<typeof DDLOutput>;
}

export function OutputContainer({ ddlOutputProps }: OutputContainerProps) {
  return <DDLOutput {...ddlOutputProps} />;
}
