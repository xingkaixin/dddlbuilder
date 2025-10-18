import type { ReactElement } from 'react'

// Mock event types
export interface MockEvent {
  preventDefault: () => void
  stopPropagation: () => void
  target: {
    value?: string
    files?: FileList | null
    [key: string]: any
  }
  currentTarget: {
    value?: string
    [key: string]: any
  }
  [key: string]: any
}

// Mock file type
export interface MockFile {
  name: string
  lastModified: number
  size: number
  type: string
  arrayBuffer?: ArrayBuffer
  slice?: (start?: number, end?: number) => ArrayBuffer
  text: () => Promise<string>
  stream: () => ReadableStream
}

// Handsontable mock types
export interface MockCellChange {
  row: number
  col: number
  oldValue: any
  newValue: any
}

export interface MockHotTableInstance {
  getCellMeta: (row: number, col: number) => any
  setCellMeta: (row: number, col: number, meta: any) => void
  getData: () => any[][]
  setDataAtCell: (row: number, col: number, value: any) => void
  render: () => void
  deselectCell: () => void
  selectCell: (row: number, col: number) => void
  getSelectedRange: () => any
  updateSettings: (settings: any) => void
  listen: (event: string, callback: Function) => void
  unlisten: (event: string, callback: Function) => void
  addHook: (hook: string, callback: Function) => void
  removeHook: (hook: string, callback: Function) => void
  destroy: () => void
}

// Test render utilities
export interface TestRenderOptions {
  wrapper?: ReactElement
  baseElement?: HTMLElement
}

// Clipboard mock types
export interface MockClipboard {
  writeText: (text: string) => Promise<void>
  readText: () => Promise<string>
}

// LocalStorage mock types
export interface MockLocalStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
  clear: () => void
  length: number
  key: (index: number) => string | null
}

// Event handler types
export type MockEventHandler = (event: MockEvent) => void | Promise<void>
export type MockKeyboardEventHandler = (event: MockEvent & { key: string }) => void

// React test utilities
export interface TestRenderResult {
  container: HTMLElement
  baseElement: HTMLElement
  asFragment: DocumentFragment
  debug: () => void
  rerender: (ui: ReactElement) => void
  unmount: () => void
  toJSON: () => string
}