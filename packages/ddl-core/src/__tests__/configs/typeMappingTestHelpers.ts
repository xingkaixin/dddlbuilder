import type { ParsedFieldType } from '@ddlbuilder/shared-types';
import type { TypeMappingRule } from '../../configs/typeMappings';

export const applyTransform = (rule: TypeMappingRule, parsed: ParsedFieldType): string => {
  if (!('transform' in rule)) throw new Error('Expected a transform type mapping rule');
  return rule.transform(parsed);
};
