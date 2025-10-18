import { render, RenderOptions } from '@testing-library/react'
import { ReactElement } from 'react'
import { vi } from 'vitest'

// Custom render function with providers if needed
const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => {
  // In the future, you can add providers here (Theme, Router, etc.)
  return render(ui, { ...options })
}

// Re-export everything from testing-library
export * from '@testing-library/react'
export { default as userEvent } from '@testing-library/user-event'

// Override the default render with our custom one
export { customRender as render }

// Helper functions for common test operations
export const waitForAnimationFrame = () =>
  new Promise(resolve => setTimeout(resolve, 0))

export const createMockEvent = (overrides = {}) => ({
  target: { value: '' },
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
  ...overrides,
})

export const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
}

// Helper to mock clipboard API
export const mockClipboard = {
  writeText: vi.fn().mockResolvedValue(undefined),
  readText: vi.fn().mockResolvedValue(''),
}

// Helper function to setup localStorage mock
export const setupLocalStorageMock = () => {
  Object.defineProperty(window, 'localStorage', {
    value: mockLocalStorage,
    writable: true,
  })
}

// Helper function to setup clipboard mock
export const setupClipboardMock = () => {
  Object.defineProperty(navigator, 'clipboard', {
    value: mockClipboard,
    writable: true,
  })
}

// Helper to create field data
export const createTestField = (overrides = {}) => ({
  order: 1,
  fieldName: 'test_field',
  fieldType: 'varchar(255)',
  fieldComment: 'Test field',
  nullable: '是',
  defaultKind: '无',
  defaultValue: '',
  onUpdate: '无',
  ...overrides,
})

// Helper to create normalized field data
export const createTestNormalizedField = (overrides = {}) => ({
  name: 'test_field',
  type: 'varchar(255)',
  comment: 'Test field',
  nullable: true,
  defaultKind: 'none',
  defaultValue: '',
  onUpdate: 'none',
  ...overrides,
})

// Helper to create index definition
export const createTestIndex = (overrides = {}) => ({
  id: 'test-index-1',
  name: 'idx_test_field',
  fields: [{ name: 'test_field', direction: 'ASC' }],
  unique: false,
  ...overrides,
})

// Helper function to simulate keyboard events
export const createKeyboardEvent = (key: string, options = {}) => ({
  key,
  code: key,
  keyCode: key.charCodeAt(0),
  which: key.charCodeAt(0),
  bubbles: true,
  cancelable: true,
  ...options,
})

// Helper to test async operations
export const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0))