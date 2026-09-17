import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@/__tests__/utils/test-utils';
import { setupSchemaTools, renderTool, jsonFile } from '@/__tests__/utils/schemaTools';
import { SnapshotFileInput } from '@/components/schema-tools/SnapshotFileInput';
import { DictionaryTool } from '@/components/schema-tools/DictionaryTool';
import { SnapshotRefreshTool } from '@/components/schema-tools/SnapshotRefreshTool';
import { MigrationAssessmentTool } from '@/components/schema-tools/MigrationAssessmentTool';
import { RelationalSeedTool } from '@/components/schema-tools/RelationalSeedTool';
import { parseSqlSnapshot } from '@/components/schema-tools/sqlSnapshot';
import { encodeDeliverySnapshot, decodeDeliverySnapshot } from '@ddlbuilder/workspace-core';
import { snapshotTableKey } from '@ddlbuilder/ddl-core';
import { decodeSeedScenario } from '@ddlbuilder/shared-types/api';
import { readSeedScenarios, storeSeedScenario } from '@/utils/seedScenarios';

let harness: ReturnType<typeof setupSchemaTools>;

beforeEach(() => {
  harness = setupSchemaTools();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const sql =
  'CREATE TABLE users (id INT PRIMARY KEY, amount DECIMAL(8,2), created DATE, due DATE, state VARCHAR(10));';

async function enterSql(value = sql) {
  fireEvent.change(screen.getByLabelText('数据来源'), { target: { value: 'sql' } });
  fireEvent.change(screen.getByLabelText('表结构 SQL'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: '解析 SQL' }));
  await screen.findByRole('checkbox', { name: /^users/ });
}

async function snapshotFile() {
  const tables = await parseSqlSnapshot(sql, 'mysql');
  tables[0].rows[0] = { ...tables[0].rows[0], standardId: 'identifier', fieldComment: '业务主键' };

  return encodeDeliverySnapshot({
    tables,
    standards: [{ id: 'identifier', name: '用户编号', description: '稳定业务标识', unit: '' }],
  });
}

describe('portable structure workflows', () => {
  it('roundtrips standards through a file and clears a previous source selection', async () => {
    const file = await snapshotFile();
    renderTool(<DictionaryTool />);
    fireEvent.change(screen.getByLabelText('数据来源'), { target: { value: 'snapshot' } });
    fireEvent.change(screen.getByLabelText('结构快照 JSON'), {
      target: { files: [jsonFile(file)] },
    });
    await screen.findByText(/稳定业务标识/);
    await waitFor(() => expect(screen.getByRole('button', { name: '导出结构快照' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '导出结构快照' }));
    expect(
      decodeDeliverySnapshot(JSON.parse((await harness.lastDownload()).text)).standards[0].name,
    ).toBe('用户编号');
    fireEvent.change(screen.getByLabelText('数据来源'), { target: { value: 'sql' } });
    expect(screen.queryByRole('checkbox', { name: /^users/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导出结构快照' })).toBeDisabled();
  });

  it('previews physical changes while retaining business annotations and reports invalid files', async () => {
    const file = await snapshotFile();
    renderTool(<SnapshotRefreshTool />);
    fireEvent.change(screen.getByLabelText('原有结构快照文件'), {
      target: { files: [jsonFile(file)] },
    });
    await screen.findByText('已读取 1 张表');
    await enterSql('CREATE TABLE users (id BIGINT PRIMARY KEY, email VARCHAR(100));');
    await screen.findByRole('button', { name: '下载刷新后的结构快照' });
    expect(screen.getAllByText(/BIGINT/i).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: '下载刷新后的结构快照' }));
    const result = decodeDeliverySnapshot(JSON.parse((await harness.lastDownload()).text));
    expect(result.tables[0].rows[0]).toMatchObject({
      fieldType: 'BIGINT',
      fieldComment: '业务主键',
      standardId: 'identifier',
    });
    fireEvent.click(screen.getByRole('button', { name: '导出对比报告' }));
    expect((await harness.lastDownload()).text).toContain('email');
    fireEvent.change(screen.getByLabelText('原有结构快照文件'), {
      target: { files: [jsonFile('{bad')] },
    });
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: '下载刷新后的结构快照' })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('原有结构快照文件'), {
      target: { files: [jsonFile('x'.repeat(2 * 1024 * 1024 + 1))] },
    });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('文件过大'));
  });

  it('ignores an older file read after a newer snapshot was selected', async () => {
    const content = await snapshotFile();
    let finish: (value: string) => void = () => {};

    const first = jsonFile(content);
    Object.defineProperty(first, 'text', {
      configurable: true,
      value: () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    });
    const onChange = vi.fn();
    renderTool(<SnapshotFileInput label="Snapshot" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Snapshot'), { target: { files: [first] } });
    fireEvent.change(screen.getByLabelText('Snapshot'), { target: { files: [jsonFile(content)] } });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    finish(content);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('exports a complete compatibility report and blocks non-MySQL input', async () => {
    renderTool(<MigrationAssessmentTool />);
    await enterSql('CREATE TABLE users (id BIGINT UNSIGNED, clock TIMESTAMP, state VARCHAR(10));');
    expect(screen.getByRole('status')).toHaveTextContent('人工核查');
    fireEvent.click(screen.getByRole('button', { name: '导出兼容性报告' }));
    expect((await harness.lastDownload()).text).toContain('numeric(20,0)');
    expect((await harness.lastDownload()).text).toContain('会话时区');
    fireEvent.change(screen.getByLabelText('数据库'), { target: { value: 'postgresql' } });
    fireEvent.change(screen.getByLabelText('表结构 SQL'), {
      target: { value: 'CREATE TABLE users (id INT);' },
    });
    fireEvent.click(screen.getByRole('button', { name: '解析 SQL' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: '导出兼容性报告' })).toBeDisabled();
  });
});

describe('saved business scenarios', () => {
  it('saves, reloads and exports an exact range scenario and invalidates generated output', async () => {
    renderTool(<RelationalSeedTool />);
    await enterSql();
    fireEvent.click(screen.getByText('业务测试场景'));
    fireEvent.change(screen.getByLabelText('场景名称'), { target: { value: '正常订单' } });
    fireEvent.change(screen.getByLabelText('规则字段'), { target: { value: 'amount' } });
    fireEvent.change(screen.getByLabelText('生成方式'), { target: { value: 'range' } });
    fireEvent.change(screen.getByLabelText('最小值'), { target: { value: '1.20' } });
    fireEvent.change(screen.getByLabelText('最大值'), { target: { value: '1.20' } });
    fireEvent.click(screen.getByRole('button', { name: '添加或替换字段规则' }));
    fireEvent.click(screen.getByRole('button', { name: '保存场景' }));
    expect(readSeedScenarios()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '生成测试数据' }));
    fireEvent.click(screen.getByRole('button', { name: '导出 JSON' }));
    expect((await harness.lastDownload()).text).toContain('1.20');
    fireEvent.change(screen.getByLabelText('场景名称'), { target: { value: '修改' } });
    expect(screen.getByRole('button', { name: '导出 JSON' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '读取已保存场景' }));
    fireEvent.change(screen.getByLabelText('选择已保存场景'), { target: { value: '正常订单' } });
    expect(screen.getByLabelText('场景名称')).toHaveValue('正常订单');
    expect(screen.getByText('1.20 – 1.20')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '导出场景 JSON' }));
    expect(decodeSeedScenario(JSON.parse((await harness.lastDownload()).text)).rules).toHaveLength(
      1,
    );
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: '保存场景' }));
    expect(readSeedScenarios()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    expect(screen.queryByText(/amount · 数值范围/)).not.toBeInTheDocument();
  });

  it('configures weighted and date rules, keeps valid configuration after invalid import', async () => {
    renderTool(<RelationalSeedTool />);
    await enterSql();
    fireEvent.click(screen.getByText('业务测试场景'));
    fireEvent.change(screen.getByLabelText('规则字段'), { target: { value: 'state' } });
    fireEvent.change(screen.getByLabelText('生成方式'), { target: { value: 'weighted' } });
    fireEvent.change(screen.getByLabelText('枚举权重（每行 值=权重）'), {
      target: { value: 'paid=80\npending=20' },
    });
    fireEvent.change(screen.getByLabelText('空值比例（%）'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: '添加或替换字段规则' }));
    fireEvent.change(screen.getByLabelText('规则字段'), { target: { value: 'created' } });
    fireEvent.change(screen.getByLabelText('生成方式'), { target: { value: 'date' } });
    fireEvent.change(screen.getByLabelText('起始日期'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('结束日期'), { target: { value: '2026-09-02' } });
    fireEvent.click(screen.getByRole('button', { name: '添加或替换字段规则' }));
    fireEvent.change(screen.getByLabelText('规则字段'), { target: { value: 'due' } });
    fireEvent.change(screen.getByLabelText('生成方式'), { target: { value: 'offset' } });
    fireEvent.change(screen.getByLabelText('来源日期字段'), { target: { value: 'created' } });
    fireEvent.change(screen.getByLabelText('偏移天数'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: '添加或替换字段规则' }));
    fireEvent.click(screen.getByRole('button', { name: '生成测试数据' }));
    expect(screen.getByRole('button', { name: '导出 JSON' })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('导入场景 JSON'), {
      target: { files: [jsonFile('{bad')] },
    });
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: '导出 JSON' })).toBeEnabled();

    const scenario = {
      version: 1,
      name: 'Imported',
      seed: 'imported',
      includeLogical: true,
      rows: [{ tableKey: snapshotTableKey((await parseSqlSnapshot(sql, 'mysql'))[0]), count: 2 }],
      rules: [],
    };
    fireEvent.change(screen.getByLabelText('导入场景 JSON'), {
      target: { files: [jsonFile(JSON.stringify(scenario))] },
    });
    await waitFor(() => expect(screen.getByLabelText('场景名称')).toHaveValue('Imported'));
    expect(screen.getByLabelText('users 的行数')).toHaveValue(2);
    expect(screen.getByRole('button', { name: '导出 JSON' })).toBeDisabled();
  });

  it('preserves saved scenarios when storage is corrupt or the limit is reached', () => {
    const scenario = decodeSeedScenario({
      version: 1,
      name: 'test',
      seed: 'seed',
      includeLogical: false,
      rows: [],
      rules: [],
    });

    for (let i = 0; i < 50; i++) storeSeedScenario({ ...scenario, name: `scenario-${i}` });
    expect(() => storeSeedScenario(scenario)).toThrow('50');
    storeSeedScenario({ ...scenario, name: 'scenario-0', seed: 'updated' });
    expect(readSeedScenarios()).toHaveLength(50);
    harness.storage.set('ddlbuilder:seed-scenarios:v1', '{}');
    expect(() => readSeedScenarios()).toThrow('Invalid');
  });
});
