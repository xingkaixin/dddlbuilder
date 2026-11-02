import { useReducer } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuthActions, useAuthIdentity } from '@/auth/AuthSessionProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/useToast';
import { useWorkspaceYDoc } from '@/providers/WorkspaceYDocProvider';
import { SettingGroup, SettingRow } from './SettingRow';

const accountNameReducer = (_name: string, event: { type: 'nameEdited'; name: string }) =>
  event.name;

type PasswordField = 'currentPassword' | 'newPassword' | 'confirmPassword';

type PasswordState = Record<PasswordField, string>;

type PasswordEvent =
  | { type: 'passwordFieldChanged'; field: PasswordField; value: string }
  | { type: 'passwordChanged' };

const initialPasswordState: PasswordState = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

function passwordReducer(state: PasswordState, event: PasswordEvent): PasswordState {
  switch (event.type) {
    case 'passwordFieldChanged':
      return { ...state, [event.field]: event.value };
    case 'passwordChanged':
      return initialPasswordState;
  }
}

function AccountNameForm({
  initialName,
  updateUserName,
}: {
  initialName: string;
  updateUserName: (name: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { success, error } = useToast();
  const [name, dispatch] = useReducer(accountNameReducer, initialName);

  const updateNameMutation = useMutation({
    mutationFn: updateUserName,
    onSuccess: () => success(t('settings.usernameSuccess')),
    onError: (err) => error(err instanceof Error ? err.message : t('settings.usernameFailed')),
  });

  const handleSubmit = () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      error(t('settings.usernameRequired'));

      return;
    }

    updateNameMutation.mutate(trimmedName);
  };

  return (
    <SettingRow title={t('settings.username')}>
      <div className="flex w-full items-center gap-2">
        <Input
          value={name}
          aria-label={t('settings.username')}
          onChange={(event) => dispatch({ type: 'nameEdited', name: event.target.value })}
          placeholder={t('settings.usernamePlaceholder')}
        />
        <Button type="button" onClick={handleSubmit} disabled={updateNameMutation.isPending}>
          {updateNameMutation.isPending ? t('settings.saving') : t('settings.save')}
        </Button>
      </div>
    </SettingRow>
  );
}

function PasswordForm({
  changePassword,
}: {
  changePassword: (current: string, next: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { success, error } = useToast();

  const [{ currentPassword, newPassword, confirmPassword }, dispatch] = useReducer(
    passwordReducer,
    initialPasswordState,
  );

  const changePasswordMutation = useMutation({
    mutationFn: (passwords: { current: string; next: string }) =>
      changePassword(passwords.current, passwords.next),
    onSuccess: () => {
      dispatch({ type: 'passwordChanged' });
      success(t('settings.passwordSuccess'));
    },
    onError: (err) => error(err instanceof Error ? err.message : t('settings.passwordFailed')),
  });
  const savingPassword = changePasswordMutation.isPending;

  const handleChangePassword = () => {
    if (!currentPassword.trim() || !newPassword.trim()) {
      error(t('settings.passwordRequired'));

      return;
    }

    if (newPassword !== confirmPassword) {
      error(t('settings.passwordMismatch'));

      return;
    }

    changePasswordMutation.mutate({ current: currentPassword, next: newPassword });
  };

  return (
    <SettingRow title={t('settings.passwordSection')}>
      <div className="flex w-full flex-col gap-2">
        <Input
          type="password"
          value={currentPassword}
          onChange={(event) =>
            dispatch({
              type: 'passwordFieldChanged',
              field: 'currentPassword',
              value: event.target.value,
            })
          }
          placeholder={t('settings.currentPassword')}
          autoComplete="current-password"
        />
        <Input
          type="password"
          value={newPassword}
          onChange={(event) =>
            dispatch({
              type: 'passwordFieldChanged',
              field: 'newPassword',
              value: event.target.value,
            })
          }
          placeholder={t('settings.newPassword')}
          autoComplete="new-password"
        />
        <Input
          type="password"
          value={confirmPassword}
          onChange={(event) =>
            dispatch({
              type: 'passwordFieldChanged',
              field: 'confirmPassword',
              value: event.target.value,
            })
          }
          placeholder={t('settings.confirmPassword')}
          autoComplete="new-password"
        />
        <div className="flex justify-end">
          <Button type="button" onClick={handleChangePassword} disabled={savingPassword}>
            {savingPassword ? t('settings.saving') : t('settings.updatePassword')}
          </Button>
        </div>
      </div>
    </SettingRow>
  );
}

export function AccountSettings() {
  const { t } = useTranslation();
  const { success, error } = useToast();
  const { email, name, userId } = useAuthIdentity();
  const { changePassword, signOut, updateUserName } = useAuthActions();

  const handleSignOut = async () => {
    try {
      await signOut();
      success(t('header.auth.signedOut'));
    } catch (err) {
      error(err instanceof Error ? err.message : t('header.auth.signOutFailed'));
    }
  };

  return (
    <SettingGroup id="account" title={t('settings.accountTab')}>
      <SettingRow title={t('settings.email')} hint={t('settings.emailReadonly')}>
        <span className="font-text text-sm">{email ?? '-'}</span>
      </SettingRow>
      <AccountNameForm
        key={`${userId}:${name ?? ''}`}
        initialName={name ?? ''}
        updateUserName={updateUserName}
      />
      <PasswordForm changePassword={changePassword} />
      <SettingRow title={t('header.auth.signOut')} hint={t('settingsPage.signOutHint')}>
        <Button type="button" variant="outline" onClick={handleSignOut}>
          {t('header.auth.signOut')}
        </Button>
      </SettingRow>
    </SettingGroup>
  );
}

export function WorkspaceSyncSettings() {
  const { t } = useTranslation();
  const { status } = useAuthIdentity();
  const workspaceYDoc = useWorkspaceYDoc();

  const workspaceStatusKey =
    workspaceYDoc.connectionState === 'offline'
      ? 'offlineLocalSaved'
      : workspaceYDoc.connectionState === 'error'
        ? 'syncFailed'
        : workspaceYDoc.synced
          ? 'cloudSynced'
          : workspaceYDoc.connectionState === 'connecting'
            ? 'syncing'
            : 'localSaved';

  return (
    <SettingGroup id="workspace" title={t('settings.workspaceTab')}>
      <SettingRow
        title={t(`workspaceYDoc.status.${workspaceStatusKey}`)}
        hint={
          status === 'signed_in'
            ? t('settings.workspaceSyncDescription')
            : t('settings.syncRequiresLogin')
        }
      >
        {workspaceYDoc.connectionState === 'error' ? (
          <Button type="button" variant="outline" size="sm" onClick={workspaceYDoc.retry}>
            {t('workspaceYDoc.status.retry')}
          </Button>
        ) : null}
      </SettingRow>
    </SettingGroup>
  );
}
