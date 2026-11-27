import { useEffect, useRef } from 'react';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { useTranslation } from 'react-i18next';
import { getPresetDefinition, isOutputTab, type OutputTab } from '@/utils/presetTemplates';
import { isBuilderTab, type BuilderTab } from '@/utils/tabUtils';

interface UseUrlPresetLaunchParams {
  hydrated: boolean;
  isShareView: boolean;
  openStateInNewDraftTab: (state: PersistedState) => void;
  setActiveTab: (tab: BuilderTab) => void;
  setOutputTab: (tab: OutputTab) => void;
  showToast: (message: string) => void;
}

export function resolvePresetLaunch(search: string) {
  const params = new URLSearchParams(search);
  const preset = getPresetDefinition(params.get('preset'));

  if (!preset) return null;

  const tabParam = params.get('tab');
  const outputParam = params.get('output');

  params.delete('preset');
  params.delete('tab');
  params.delete('output');

  return {
    preset,
    activeTab: tabParam && isBuilderTab(tabParam) ? tabParam : preset.defaultTab,
    outputTab: outputParam && isOutputTab(outputParam) ? outputParam : preset.defaultOutput,
    remainingSearch: params.toString(),
  };
}

// Consumes one-shot `?preset=` launch parameters from window.location into a fresh draft tab.
export function useUrlPresetLaunch({
  hydrated,
  isShareView,
  openStateInNewDraftTab,
  setActiveTab,
  setOutputTab,
  showToast,
}: UseUrlPresetLaunchParams) {
  const { t } = useTranslation();
  const consumedRef = useRef(false);

  useEffect(() => {
    if (consumedRef.current || !hydrated || isShareView) return;
    consumedRef.current = true;

    const launch = resolvePresetLaunch(window.location.search);

    if (!launch) return;

    openStateInNewDraftTab(launch.preset.state);

    if (launch.activeTab) setActiveTab(launch.activeTab);

    if (launch.outputTab) setOutputTab(launch.outputTab);

    const nextUrl = `${window.location.pathname}${launch.remainingSearch ? `?${launch.remainingSearch}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', nextUrl);

    window.umami?.track('preset_loaded', { preset: launch.preset.id });
    showToast(t('emptyState.exampleLoaded'));
  }, [hydrated, isShareView, openStateInNewDraftTab, setActiveTab, setOutputTab, showToast, t]);
}
