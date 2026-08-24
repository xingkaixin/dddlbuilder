import { OutputContainer, type OutputContainerProps } from './containers/OutputContainer';
import {
  TableBuilderContainer,
  type TableBuilderContainerProps,
} from './containers/TableBuilderContainer';

export interface EditorSurfaceModel {
  isShareView: boolean;
  outputPanelOpen: boolean;
  tableBuilderProps: TableBuilderContainerProps;
  outputProps: OutputContainerProps;
}

export function EditorSurface({ model }: { model: EditorSurfaceModel }) {
  const { isShareView, outputPanelOpen, tableBuilderProps, outputProps } = model;

  return (
    <div className="flex flex-col gap-4 xl:flex-row">
      <div
        className={`min-w-0 flex-1 ${
          isShareView ? 'pointer-events-none select-none opacity-80' : ''
        }`}
      >
        <TableBuilderContainer {...tableBuilderProps} />
      </div>

      {(isShareView || outputPanelOpen) && <OutputContainer {...outputProps} />}
    </div>
  );
}
