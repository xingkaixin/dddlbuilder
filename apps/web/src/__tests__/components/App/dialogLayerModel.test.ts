import { describe, expect, it } from 'vitest';
import { buildAppDialogLayerModel } from '@/components/App/buildAppDialogLayerModel';

describe('dialog template catalog', () => {
  it('shares the same template catalog between AI generation and editing', () => {
    const templates: never[] = [];
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
    } as unknown as Parameters<typeof buildAppDialogLayerModel>[0]);
    expect(model.aiPatch.templates).toBe(model.globalDialogs.aiGenerateDialogProps.templates);
  });
});
