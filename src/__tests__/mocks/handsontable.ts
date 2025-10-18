import { vi } from 'vitest'

// Mock Handsontable
export const mockHotTable = vi.fn().mockImplementation(({ children, ...props }) => {
  return React.createElement('div', {
    'data-testid': 'hot-table',
    ...props,
  }, children)
})

// Mock Handsontable utilities
export const mockRegisterAllModules = vi.fn()

// Mock Handsontable types
export type MockCellChange = [number, string | number, any, any]

export const mockHotTableInstance = {
  getCellMeta: vi.fn(),
  setCellMeta: vi.fn(),
  getData: vi.fn(),
  setDataAtCell: vi.fn(),
  render: vi.fn(),
  deselectCell: vi.fn(),
  selectCell: vi.fn(),
  getSelectedRange: vi.fn(),
  updateSettings: vi.fn(),
  listen: vi.fn(),
  unlisten: vi.fn(),
  addHook: vi.fn(),
  removeHook: vi.fn(),
  destroy: vi.fn(),
}

// Mock Handsontable events
export const mockHandsontableEvents = {
  afterChange: vi.fn(),
  afterCreateRow: vi.fn(),
  afterRemoveRow: vi.fn(),
  beforeKeydown: vi.fn(),
  afterSelection: vi.fn(),
  beforeAutofill: vi.fn(),
  afterAutofill: vi.fn(),
}

// Default test data for Handsontable
export const mockTableData = [
  [1, 'id', 'int', '主键ID', '否', '自增', '', '无'],
  [2, 'name', 'varchar(255)', '名称', '是', '无', '', '无'],
  [3, 'created_at', 'timestamp', '创建时间', '否', '当前时间', '', '无'],
]

// Mock column settings
export const mockColumnSettings = [
  { data: 'order', readOnly: true, width: 48, className: 'htCenter' },
  { data: 'fieldName', type: 'text' },
  { data: 'fieldComment', type: 'text' },
  { data: 'fieldType', type: 'text' },
  { data: 'nullable', type: 'checkbox', className: 'htCenter' },
  { data: 'defaultKind', type: 'dropdown' },
  { data: 'defaultValue', type: 'text' },
  { data: 'onUpdate', type: 'dropdown' },
]