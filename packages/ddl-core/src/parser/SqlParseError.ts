export class SqlParseError extends Error {
  readonly parserMessage: string;

  constructor(message: string, parserMessage = message, cause?: unknown) {
    super(message, { cause });
    this.name = 'SqlParseError';
    this.parserMessage = parserMessage;
  }

  static unsupported(feature: string): SqlParseError {
    return new SqlParseError(`暂不支持导入 ${feature}，无法完整保留该定义。`);
  }
}
