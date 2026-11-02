import type { ComponentType } from 'react';
import {
  BookOpen,
  Bot,
  FileInput,
  GitCompare,
  HardDrive,
  Layers,
  LayoutTemplate,
  ListChecks,
  Network,
  RefreshCw,
  Search,
  Share2,
  ShieldCheck,
  Sparkles,
  Table2,
  Zap,
  type AppIconProps,
} from '@/components/icons';

export interface ToolEntry {
  id: string;
  label: string;
  icon: ComponentType<AppIconProps>;
}

export interface ToolGroup {
  id: string;
  label: string;
  tools: ToolEntry[];
}

export const PAGE_TOOL_GROUPS = [
  {
    id: 'delivery',
    label: 'schemaTools.groups.delivery',
    tools: [
      { id: 'dictionary', label: 'schemaTools.dictionary.title', icon: BookOpen },
      { id: 'publications', label: 'publication.manage', icon: Share2 },
      { id: 'sqlite', label: 'modelTools.sqlite', icon: HardDrive },
    ],
  },
  {
    id: 'design',
    label: 'schemaTools.groups.design',
    tools: [
      { id: 'query', label: 'modelTools.query', icon: Search },
      { id: 'modules', label: 'modelTools.modules', icon: Layers },
      { id: 'impact', label: 'modelTools.impact', icon: Network },
      { id: 'compare', label: 'schemaTools.compare.title', icon: GitCompare },
      { id: 'assessment', label: 'assessment.title', icon: ShieldCheck },
    ],
  },
  {
    id: 'data',
    label: 'schemaTools.groups.data',
    tools: [
      { id: 'seed', label: 'schemaTools.seed.title', icon: Table2 },
      { id: 'data-import', label: 'dataImport.title', icon: FileInput },
      { id: 'refresh', label: 'snapshot.refresh', icon: RefreshCw },
    ],
  },
] as const satisfies readonly ToolGroup[];

export const ACTION_TOOL_GROUPS = [
  {
    id: 'assets',
    label: 'toolsPage.groups.assets',
    tools: [
      { id: 'field-standards', label: 'fieldStandards.title', icon: ListChecks },
      { id: 'field-templates', label: 'toolsPage.fieldTemplates', icon: LayoutTemplate },
      { id: 'table-templates', label: 'toolsPage.tableTemplates', icon: Table2 },
    ],
  },
  {
    id: 'ai',
    label: 'toolsPage.groups.ai',
    tools: [
      { id: 'ai-generate', label: 'toolsPage.aiGenerate', icon: Sparkles },
      { id: 'ai-patch', label: 'dataTable.toolbar.aiPatch', icon: Sparkles },
      { id: 'ai-comments', label: 'dataTable.toolbar.aiComments', icon: Bot },
      { id: 'index-advisor', label: 'aiIndexAdvisor.title', icon: Zap },
    ],
  },
] as const satisfies readonly ToolGroup[];

export type PageToolId = (typeof PAGE_TOOL_GROUPS)[number]['tools'][number]['id'];

export type ActionTool = (typeof ACTION_TOOL_GROUPS)[number]['tools'][number];

export const TOOL_GROUPS: readonly ToolGroup[] = [...PAGE_TOOL_GROUPS, ...ACTION_TOOL_GROUPS];

const PAGE_TOOL_IDS = new Set<string>(
  PAGE_TOOL_GROUPS.flatMap((group) => group.tools.map((tool) => tool.id)),
);

export const isPageToolId = (id: string): id is PageToolId => PAGE_TOOL_IDS.has(id);
