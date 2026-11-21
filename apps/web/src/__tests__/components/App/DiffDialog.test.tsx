import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast, Toaster } from 'sonner';
import type { TableDiff } from '@ddlbuilder/ddl-core';
import { render } from '@/__tests__/utils/test-utils';
import { DiffDialog } from '@/components/App/DiffDialog';
import { i18n } from '@/i18n';

const tableDiff: TableDiff = {
  oldDbType: 'mysql',
  newDbType: 'mysql',
  tableNameChanged: false,
  oldTableName: 'users',
  newTableName: 'users',
  oldSchemaName: '',
  newSchemaName: '',
  tableCommentChanged: false,
  miscConfigChanged: false,
  fields: [
    {
      type: 'add',
      fieldName: 'email',
      newField: {
        name: 'email',
        type: 'varchar(255)',
        nullable: false,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
        comment: 'User email',
      },
    },
  ],
  indexes: [],
  foreignKeys: [],
};

const originalExecCommand = Object.getOwnPropertyDescriptor(document, 'execCommand');

function setClipboardMocks(options: { writeTextError?: Error; execCommandResult: boolean }) {
  const writeText = vi.spyOn(navigator.clipboard, 'writeText');

  if (options.writeTextError) {
    writeText.mockRejectedValue(options.writeTextError);
  } else {
    writeText.mockResolvedValue(undefined);
  }

  const execCommand = vi.fn(() => options.execCommandResult);
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    value: execCommand,
  });

  return { writeText, execCommand };
}

describe('DiffDialog clipboard copy', () => {
  afterEach(() => {
    toast.dismiss();
    vi.restoreAllMocks();

    if (originalExecCommand) {
      Object.defineProperty(document, 'execCommand', originalExecCommand);
    } else {
      Reflect.deleteProperty(document, 'execCommand');
    }
  });

  it.each(['alter', 'rollback'] as const)(
    'falls back through copyText when clipboard API rejects (%s DDL)',
    async (kind) => {
      const { writeText, execCommand } = setClipboardMocks({
        writeTextError: new Error('clipboard denied'),
        execCommandResult: true,
      });
      const onCopy = vi.fn();

      render(
        <>
          <DiffDialog open onOpenChange={vi.fn()} diff={tableDiff} onCopy={onCopy} />
          <Toaster />
        </>,
      );

      if (kind === 'rollback') {
        fireEvent.click(screen.getByRole('button', { name: i18n.t('diffDialog.rollbackScript') }));
      }

      const buttonName =
        kind === 'alter' ? i18n.t('diffDialog.copy') : i18n.t('diffDialog.copyRollback');
      fireEvent.click(screen.getByRole('button', { name: buttonName }));

      await waitFor(() => expect(onCopy).toHaveBeenCalledTimes(1));
      expect(writeText).toHaveBeenCalledTimes(1);
      expect(execCommand).toHaveBeenCalledWith('copy');
      expect(screen.queryByText(i18n.t('ddlOutput.copyFailed'))).not.toBeInTheDocument();
    },
  );

  it.each(['alter', 'rollback'] as const)(
    'shows failure feedback and skips onCopy when copying fails (%s DDL)',
    async (kind) => {
      setClipboardMocks({
        writeTextError: new Error('clipboard denied'),
        execCommandResult: false,
      });
      const onCopy = vi.fn();

      render(
        <>
          <DiffDialog open onOpenChange={vi.fn()} diff={tableDiff} onCopy={onCopy} />
          <Toaster />
        </>,
      );

      if (kind === 'rollback') {
        fireEvent.click(screen.getByRole('button', { name: i18n.t('diffDialog.rollbackScript') }));
      }

      const buttonName =
        kind === 'alter' ? i18n.t('diffDialog.copy') : i18n.t('diffDialog.copyRollback');
      fireEvent.click(screen.getByRole('button', { name: buttonName }));

      await screen.findByText(i18n.t('ddlOutput.copyFailed'));
      expect(onCopy).not.toHaveBeenCalled();
    },
  );
});
