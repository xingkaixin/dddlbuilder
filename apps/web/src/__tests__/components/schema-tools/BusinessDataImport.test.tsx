import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@/__tests__/utils/test-utils';
import { setupSchemaTools, renderTool, jsonFile } from '@/__tests__/utils/schemaTools';
import { BusinessDataImportTool } from '@/components/data-import/BusinessDataImportTool';
import {
  executeBusinessDataTask,
  type BusinessDataReply,
  type BusinessDataTask,
} from '@/utils/business-data/tasks';

class BrowserTaskWorker {
  onmessage: ((event: MessageEvent<BusinessDataReply>) => void) | null = null;
  onerror: (() => void) | null = null;
  terminated = false;

  postMessage(message: { task: BusinessDataTask }) {
    void executeBusinessDataTask(message.task).then(
      (output) => {
        if (!this.terminated) this.onmessage?.(new MessageEvent('message', { data: { output } }));
      },
      (cause) => {
        if (!this.terminated)
          this.onmessage?.(
            new MessageEvent('message', {
              data: { error: cause instanceof Error ? cause.message : 'Failed' },
            }),
          );
      },
    );
  }

  terminate() {
    this.terminated = true;
  }
}

let harness: ReturnType<typeof setupSchemaTools>;

beforeEach(() => {
  harness = setupSchemaTools();
  vi.stubGlobal('Worker', BrowserTaskWorker);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function readText(text = 'code,amount\n00123,19.90\n00124,29.50') {
  fireEvent.change(screen.getByLabelText('输入方式'), { target: { value: 'text' } });
  fireEvent.change(screen.getByLabelText('业务数据文本'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: '读取数据' }));
  await screen.findByText(/已读取 \d+ 行/);
}

async function validate() {
  fireEvent.click(screen.getByRole('button', { name: '校验全部数据并生成 SQL' }));
  await screen.findByRole('heading', { name: '3 · 校验结果与导出' });
}

describe('business data workflow', () => {
  it('downloads exact values, reuses settings, and never sends records to the API', async () => {
    renderTool(<BusinessDataImportTool />);
    await readText('code,amount\nCUSTOMER_PRIVATE_001,9007199254740993.01');
    fireEvent.change(screen.getByLabelText('目标数据库'), { target: { value: 'postgresql' } });
    fireEvent.change(screen.getByLabelText('目标表名'), { target: { value: 'orders' } });
    await validate();
    fireEvent.click(screen.getByRole('button', { name: '下载完整 SQL' }));
    expect((await harness.lastDownload()).text).toContain(
      "E'CUSTOMER_PRIVATE_001', 9007199254740993.01",
    );
    fireEvent.click(screen.getByText('复用导入配置'));
    fireEvent.change(screen.getByLabelText('配置名称'), { target: { value: 'monthly' } });
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));
    fireEvent.click(screen.getByRole('button', { name: '导出配置 JSON' }));
    const exported = await harness.lastDownload();
    expect(exported.text).not.toContain('CUSTOMER_PRIVATE_001');
    expect(exported.text).not.toContain('9007199254740993.01');
    expect(JSON.stringify([...harness.storage.values()])).not.toContain('CUSTOMER_PRIVATE_001');
    fireEvent.change(screen.getByLabelText('目标字段 1'), { target: { value: 'changed' } });
    expect(screen.queryByRole('button', { name: '下载完整 SQL' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('已保存配置'), { target: { value: 'monthly' } });
    fireEvent.click(screen.getByRole('button', { name: '应用配置' }));
    expect(screen.getByLabelText('目标字段 1')).toHaveValue('code');
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));
    await screen.findByText(/同名配置已存在/);
    fireEvent.change(screen.getByLabelText('导入并应用配置 JSON'), {
      target: { files: [jsonFile(exported.text)] },
    });
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '删除所选配置' }));
    expect(screen.queryByRole('option', { name: 'monthly' })).not.toBeInTheDocument();
    expect(JSON.stringify(harness.fetch.mock.calls)).not.toContain('CUSTOMER_PRIVATE_001');
  });

  it('checks all records, exports errors, and recovers after correcting mapping and format', async () => {
    renderTool(<BusinessDataImportTool />);
    await readText('code,day\n00123,31/12/2024\n00124,30/12/2024');
    fireEvent.change(screen.getByLabelText('SQL 类型 1'), { target: { value: 'varchar(2)' } });
    await validate();
    expect(screen.getByRole('button', { name: '下载完整 SQL' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '下载完整错误 JSON' }));
    expect(JSON.parse((await harness.lastDownload()).text)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ line: 3, value: '00124', code: 'length' }),
      ]),
    );
    fireEvent.change(screen.getByLabelText('文本日期格式'), { target: { value: 'dmy' } });
    fireEvent.click(screen.getByRole('button', { name: '按当前选项重新推断字段（替换编辑）' }));
    expect(screen.getByLabelText('SQL 类型 2')).toHaveValue('date');
    fireEvent.click(screen.getByLabelText('去除值首尾空格'));
    fireEvent.click(screen.getByLabelText('空单元格作为 NULL'));
    fireEvent.change(screen.getByLabelText('code 的源数据列'), { target: { value: '' } });
    await validate();
    expect(screen.getByRole('button', { name: '下载完整 SQL' })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('业务数据文本'), { target: { value: 'a,a\n1,2' } });
    expect(screen.queryByRole('button', { name: '下载完整 SQL' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '读取数据' }));
    await screen.findByText(/表头不能为空或重复/);
    expect(screen.getByRole('button', { name: '校验全部数据并生成 SQL' })).toBeDisabled();
  });

  it('maps an existing table, checks duplicate keys and omits database-generated values', async () => {
    renderTool(<BusinessDataImportTool />);
    await readText('code,amount\na,1.00\na,2.00');
    fireEvent.change(screen.getByLabelText('导入目标'), { target: { value: 'existing' } });
    fireEvent.change(screen.getByLabelText('数据来源'), { target: { value: 'sql' } });
    fireEvent.change(screen.getByLabelText('表结构 SQL'), {
      target: {
        value:
          'CREATE TABLE orders (id INT AUTO_INCREMENT PRIMARY KEY, code VARCHAR(20) NOT NULL, amount DECIMAL(8,2), CONSTRAINT uq_code UNIQUE (code));',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: '解析 SQL' }));
    await screen.findByLabelText('id 的源数据列');
    expect(screen.getByLabelText('id 的源数据列')).toHaveValue('');
    await validate();
    expect(screen.getByText('文件内键值重复')).toBeInTheDocument();
    await readText('code,amount\na,1.00\nb,2.00');
    await validate();
    fireEvent.click(screen.getByRole('button', { name: '下载完整 SQL' }));
    const output = (await harness.lastDownload()).text;
    expect(output).toContain('INSERT INTO `orders` (`code`, `amount`)');
    expect(output).not.toContain('CREATE TABLE');
  });

  it('cancels stale background reads when the source changes', async () => {
    renderTool(<BusinessDataImportTool />);
    fireEvent.change(screen.getByLabelText('输入方式'), { target: { value: 'text' } });
    fireEvent.change(screen.getByLabelText('业务数据文本'), { target: { value: 'old\nvalue' } });
    fireEvent.click(screen.getByRole('button', { name: '读取数据' }));
    fireEvent.change(screen.getByLabelText('业务数据文本'), { target: { value: 'new\nvalue' } });
    await waitFor(() => expect(screen.queryByText('正在处理…')).not.toBeInTheDocument());
    expect(screen.queryByLabelText('目标字段 1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '读取数据' }));
    await screen.findByLabelText('目标字段 1');
    expect(screen.getByLabelText('目标字段 1')).toHaveValue('new');
  });
});
