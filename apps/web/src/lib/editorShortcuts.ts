import { toPersistedState } from '@/stores/editorDocumentCodec';
import { useAppUiStore } from '@/stores/appUiStore';
import { useEditorStore } from '@/stores/editorStore';
import {
  recordEditorHistory,
  redoEditorHistory,
  runWithEditorHistoryGuard,
  seedEditorHistory,
  undoEditorHistory,
} from '@/stores/editorHistory';
import { useTabStore } from '@/stores/tabStore';
import { getPathname } from './pathnameStore';

let listening = false;

const isEditableElement = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;

  const tag = target.tagName;

  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;

  return target.isContentEditable || Boolean(target.closest('[contenteditable="true"]'));
};

const getActiveEditableTabId = (): string | null => {
  const pathname = getPathname();

  if (pathname !== '/' && pathname !== '') return null;

  const tab = useTabStore.getState().getActiveTab();

  if (!tab || tab.isLoading) return null;

  return tab.id;
};

export function listenForEditorShortcuts() {
  if (listening || typeof window === 'undefined') return;
  listening = true;

  useEditorStore.subscribe((state) => {
    const tabId = getActiveEditableTabId();

    if (!tabId) return;

    recordEditorHistory(tabId, toPersistedState(state));
  });

  useTabStore.subscribe((tabState) => {
    const active = tabState.tabs.find((tab) => tab.id === tabState.activeTabId);

    if (!active || active.isLoading) return;

    seedEditorHistory(active.id, toPersistedState(useEditorStore.getState()));
  });

  window.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.altKey) return;

    const hasMod = event.metaKey || event.ctrlKey;

    if (!hasMod) return;

    const pathname = getPathname();

    if (pathname.startsWith('/share/')) return;

    const key = event.key.toLowerCase();

    if (key === 's' && !event.shiftKey && (pathname === '/' || pathname === '')) {
      const saveButton = document.querySelector<HTMLButtonElement>(
        'button[data-shortcut="save-current"]',
      );

      if (!saveButton) return;

      event.preventDefault();

      if (!saveButton.disabled) saveButton.click();

      return;
    }

    if (isEditableElement(event.target)) return;

    if (key === 'b' && !event.shiftKey && (pathname === '/' || pathname === '')) {
      event.preventDefault();
      const ui = useAppUiStore.getState();
      ui.setWorkspaceSidebarOpen(!ui.workspaceSidebarOpen);

      return;
    }

    const tabId = getActiveEditableTabId();

    if (!tabId) return;

    if (key === 'z' && !event.shiftKey) {
      const previous = undoEditorHistory(tabId);

      if (!previous) return;
      event.preventDefault();
      runWithEditorHistoryGuard(() => useEditorStore.getState().replaceDocument(previous));

      return;
    }

    if ((key === 'z' && event.shiftKey) || (key === 'y' && event.ctrlKey && !event.metaKey)) {
      const next = redoEditorHistory(tabId);

      if (!next) return;
      event.preventDefault();
      runWithEditorHistoryGuard(() => useEditorStore.getState().replaceDocument(next));
    }
  });
}
