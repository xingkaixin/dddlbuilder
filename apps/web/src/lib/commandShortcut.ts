import { useAppUiStore } from '@/stores/appUiStore';
import { getPathname } from './pathnameStore';

export const commandShortcutLabel = () =>
  /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K';

export function listenForCommandShortcut() {
  window.addEventListener('keydown', (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
    if (getPathname().startsWith('/share/')) return;

    event.preventDefault();
    useAppUiStore.getState().setIsCommandPaletteOpen(true);
  });
}
