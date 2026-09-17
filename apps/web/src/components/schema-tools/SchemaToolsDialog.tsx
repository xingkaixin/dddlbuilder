import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DictionaryTool } from './DictionaryTool';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SchemaCompareTool } from './SchemaCompareTool';

export default function SchemaToolsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex h-[90dvh] w-[calc(100vw-1rem)] max-w-6xl flex-col gap-4 overflow-hidden p-4 sm:p-6">
        <DialogHeader className="shrink-0 pr-6">
          <DialogTitle>{t('schemaTools.title')}</DialogTitle>
          <DialogDescription>{t('schemaTools.description')}</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="dictionary" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mb-4 w-fit shrink-0">
            <TabsTrigger value="dictionary">{t('schemaTools.dictionary.title')}</TabsTrigger>
            <TabsTrigger value="compare">{t('schemaTools.compare.title')}</TabsTrigger>
          </TabsList>
          <TabsContent value="dictionary" className="min-h-0 flex-1 overflow-auto">
            <DictionaryTool />
          </TabsContent>
          <TabsContent value="compare" className="min-h-0 flex-1 overflow-auto">
            <SchemaCompareTool />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
