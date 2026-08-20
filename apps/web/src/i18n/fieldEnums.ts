import type { TFunction } from 'i18next';
import type { FieldDefaultKind, FieldOnUpdate } from '@ddlbuilder/shared-types';

const DEFAULT_KIND_KEY_MAP: Record<FieldDefaultKind, string> = {
  none: 'none',
  auto_increment: 'autoIncrement',
  constant: 'constant',
  current_timestamp: 'currentTimestamp',
  uuid: 'uuid',
};

const ON_UPDATE_KEY_MAP: Record<FieldOnUpdate, string> = {
  none: 'none',
  current_timestamp: 'currentTimestamp',
};

export function getNullableLabel(value: boolean, t: TFunction) {
  return value ? t('fieldEnums.nullable.yes') : t('fieldEnums.nullable.no');
}

export function getDefaultKindLabel(value: FieldDefaultKind | undefined, t: TFunction) {
  const key = (value && DEFAULT_KIND_KEY_MAP[value]) ?? 'none';
  return t(`fieldEnums.defaultKind.${key}`);
}

export function getOnUpdateLabel(value: FieldOnUpdate | undefined, t: TFunction) {
  const key = (value && ON_UPDATE_KEY_MAP[value]) ?? 'none';
  return t(`fieldEnums.onUpdate.${key}`);
}
