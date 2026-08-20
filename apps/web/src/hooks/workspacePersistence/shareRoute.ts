import { useSyncExternalStore } from 'react';
import { parseSharePath } from './storage';

const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getPathname = () => window.location.pathname;

/**
 * 分享路径决定了「工作区写入是否放行」，读它的组件散落在门禁和持久化两侧。
 * history.replaceState 不派发任何事件，直接调用会让这些组件停在上一次渲染读到的路径上，
 * 所以离开分享路径必须走这里统一广播。
 */
export const leaveShareRoute = () => {
  window.history.replaceState({}, '', '/');
  for (const listener of listeners) listener();
};

export const useShareRoute = () => parseSharePath(useSyncExternalStore(subscribe, getPathname));
