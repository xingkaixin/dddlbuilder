import { memo, useCallback, useState } from 'react';
import { Panel, useReactFlow } from '@xyflow/react';
import { ZoomIn, ZoomOut, Maximize, Plus, LayoutGrid } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

interface ErDiagramToolbarProps {
  onAddTable: () => void;
  onAutoLayout: () => void;
}

function ErDiagramToolbar({ onAddTable, onAutoLayout }: ErDiagramToolbarProps) {
  const { t } = useTranslation();
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const [isAdding, setIsAdding] = useState(false);

  const handleAddTable = useCallback(() => {
    setIsAdding(true);
    onAddTable();
    setTimeout(() => setIsAdding(false), 300);
  }, [onAddTable]);

  return (
    <Panel position="top-left" className="flex items-center gap-2 m-2">
      <Button
        size="sm"
        variant="default"
        className="h-8 gap-1.5"
        onClick={handleAddTable}
        disabled={isAdding}
      >
        <Plus className="h-3.5 w-3.5" />
        {t('erDiagram.toolbar.addTable')}
      </Button>
      <Button
        size="icon"
        variant="outline"
        className="h-8 w-8"
        onClick={() => zoomIn()}
        title={t('erDiagram.toolbar.zoomIn')}
      >
        <ZoomIn className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="icon"
        variant="outline"
        className="h-8 w-8"
        onClick={() => zoomOut()}
        title={t('erDiagram.toolbar.zoomOut')}
      >
        <ZoomOut className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="icon"
        variant="outline"
        className="h-8 w-8"
        onClick={() => fitView({ padding: 0.2 })}
        title={t('erDiagram.toolbar.fitView')}
      >
        <Maximize className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="icon"
        variant="outline"
        className="h-8 w-8"
        onClick={onAutoLayout}
        title={t('erDiagram.toolbar.autoLayout')}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
      </Button>
    </Panel>
  );
}

export default memo(ErDiagramToolbar);
