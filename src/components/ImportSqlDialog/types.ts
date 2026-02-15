export interface ValidationResult {
  success: boolean;
  error?: string;
  lineNumber?: number;
}

export interface PreviewField {
  order: number;
  fieldName: string;
  fieldType: string;
  fieldComment: string;
  nullable: string;
  defaultKind: string;
  defaultValue: string;
}
