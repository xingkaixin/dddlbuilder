import type { TFunction } from 'i18next';

const DEFAULT_KIND_KEY_MAP: Record<string, string> = {
  无: 'none',
  自增: 'autoIncrement',
  常量: 'constant',
  当前时间: 'currentTimestamp',
  uuid: 'uuid',
};

const ON_UPDATE_KEY_MAP: Record<string, string> = {
  无: 'none',
  当前时间: 'currentTimestamp',
};

export function getNullableLabel(value: string, t: TFunction) {
  return value === '否' ? t('fieldEnums.nullable.no') : t('fieldEnums.nullable.yes');
}

export function getDefaultKindLabel(value: string, t: TFunction) {
  const key = DEFAULT_KIND_KEY_MAP[value] ?? 'none';
  return t(`fieldEnums.defaultKind.${key}`);
}

export function getOnUpdateLabel(value: string, t: TFunction) {
  const key = ON_UPDATE_KEY_MAP[value] ?? 'none';
  return t(`fieldEnums.onUpdate.${key}`);
}
