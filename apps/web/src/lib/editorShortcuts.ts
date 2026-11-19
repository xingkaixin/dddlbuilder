import { flushSync } from 'react-dom';
import { toEditorSessionSnapshot, toPersistedState } from '@/stores/editorDocumentCodec';
import { useAppUiStore } from '@/stores/appUiStore';
import { useEditorStore } from '@/stores/editorStore';
import {
  recordEditorHistory,
  redoEditorHistory,
  runWithEditorHistoryGuard,
  isApplyingEditorHistory,
  clearEditorHistory,
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
    if (isApplyingEditorHistory()) return;
    const tabId = getActiveEditableTabId();

    if (!tabId) return;

    recordEditorHistory(tabId, toPersistedState(state));
  });

  useTabStore.subscribe((state, previous) => {
    if (state.tabs.length >= previous.tabs.length) return;

    for (const tab of previous.tabs) {
      if (!state.tabs.some((current) => current.id === tab.id)) clearEditorHistory(tab.id);
    }
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

      const focused = document.activeElement;

      if (focused instanceof HTMLElement && isEditableElement(focused)) {
        flushSync(() => focused.blur());
      }

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
      runWithEditorHistoryGuard(() =>
        useEditorStore
          .getState()
          .replaceDocument({ ...previous, ...toEditorSessionSnapshot(useEditorStore.getState()) }),
      );

      return;
    }

    if ((key === 'z' && event.shiftKey) || (key === 'y' && event.ctrlKey && !event.metaKey)) {
      const next = redoEditorHistory(tabId);

      if (!next) return;
      event.preventDefault();
      runWithEditorHistoryGuard(() =>
        useEditorStore
          .getState()
          .replaceDocument({ ...next, ...toEditorSessionSnapshot(useEditorStore.getState()) }),
      );
    }
  });
}
