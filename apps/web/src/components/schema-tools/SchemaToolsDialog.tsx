import { BusinessModuleTool } from './BusinessModuleTool';
import { QueryDesignerTool } from './QueryDesignerTool';
import { MigrationAssessmentTool } from './MigrationAssessmentTool';
import { SnapshotRefreshTool } from './SnapshotRefreshTool';
import { PublishPanel } from '@/components/publications/PublishPanel';
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
import { RelationalSeedTool } from './RelationalSeedTool';
import { BusinessDataImportTool } from '@/components/data-import/BusinessDataImportTool';

export default function SchemaToolsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        aria-label={t('schemaTools.title')}
        className="flex h-[90dvh] w-[calc(100vw-1rem)] max-w-6xl flex-col gap-4 overflow-hidden p-4 sm:p-6"
      >
        <DialogHeader className="shrink-0 pr-6">
          <DialogTitle>{t('schemaTools.title')}</DialogTitle>
          <DialogDescription>{t('schemaTools.description')}</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="dictionary" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mb-4 h-auto w-fit max-w-full shrink-0 flex-wrap">
            <TabsTrigger value="modules">{t('modelTools.modules')}</TabsTrigger>
            <TabsTrigger value="query">{t('modelTools.query')}</TabsTrigger>
            <TabsTrigger value="dictionary">{t('schemaTools.dictionary.title')}</TabsTrigger>
            <TabsTrigger value="compare">{t('schemaTools.compare.title')}</TabsTrigger>
            <TabsTrigger value="seed">{t('schemaTools.seed.title')}</TabsTrigger>
            <TabsTrigger value="data-import">{t('dataImport.title')}</TabsTrigger>
            <TabsTrigger value="publications">{t('publication.manage')}</TabsTrigger>
            <TabsTrigger value="refresh">{t('snapshot.refresh')}</TabsTrigger>
            <TabsTrigger value="assessment">{t('assessment.title')}</TabsTrigger>
          </TabsList>
          <TabsContent value="modules" className="min-h-0 flex-1 overflow-auto">
            <BusinessModuleTool />
          </TabsContent>
          <TabsContent value="query" className="min-h-0 flex-1 overflow-auto">
            <QueryDesignerTool />
          </TabsContent>
          <TabsContent value="dictionary" className="min-h-0 flex-1 overflow-auto">
            <DictionaryTool />
          </TabsContent>
          <TabsContent value="compare" className="min-h-0 flex-1 overflow-auto">
            <SchemaCompareTool />
          </TabsContent>
          <TabsContent value="seed" className="min-h-0 flex-1 overflow-auto">
            <RelationalSeedTool />
          </TabsContent>
          <TabsContent value="data-import" className="min-h-0 flex-1 overflow-auto">
            <BusinessDataImportTool />
          </TabsContent>
          <TabsContent value="publications" className="min-h-0 flex-1 overflow-auto">
            <PublishPanel content={null} title="" />
          </TabsContent>
          <TabsContent value="refresh" className="min-h-0 flex-1 overflow-auto">
            <SnapshotRefreshTool />
          </TabsContent>
          <TabsContent value="assessment" className="min-h-0 flex-1 overflow-auto">
            <MigrationAssessmentTool />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
