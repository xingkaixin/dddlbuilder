import { describe, expect, it } from 'vitest';
import { buildAppDialogLayerModel } from '@/components/App/buildAppDialogLayerModel';
import type { FieldTemplate } from '@/utils/fieldTemplates';
import type { TableTemplate } from '@/utils/tableTemplates';

describe('dialog template catalog', () => {
  it('shares the same template catalog between AI generation and editing', () => {
    const templates: Array<FieldTemplate | TableTemplate> = [];

    // SAFETY: This projection test supplies only the domains and template fields read by the model builder.
    // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- The fixture intentionally omits unrelated hook state that this projection does not read.
    const model = buildAppDialogLayerModel({
      domains: {
        editor: { schemaName: '', tableName: '' },
        ui: {},
        tableOptions: { tableMiscConfig: {} },
      },
      workspaceController: { persistenceStatus: {}, tables: {}, folders: {} },
      schemaController: { derived: {}, indexAdvisor: {}, reviewActions: {} },
      folderActions: {},
      templateActions: {},
      clearActions: {},
      savedTableFlow: {},
      tableTemplateActions: {},
      trashActions: {},
      aiPatchFlow: {},
      schemaActions: {},
      fieldTemplateData: { templates: [] },
      tableTemplateData: { templates: [] },
      dialogStates: {},
      aiGenerateTemplates: templates,
      aiPatchTargetKey: 'tab-a',
    } as unknown as Parameters<typeof buildAppDialogLayerModel>[0]);
    expect(model.aiPatch.templates).toBe(model.globalDialogs.aiGenerateDialogProps.templates);
    expect(model.aiPatch.targetKey).toBe('tab-a');
  });
});
