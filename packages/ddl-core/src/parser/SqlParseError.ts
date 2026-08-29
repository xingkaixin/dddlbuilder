export class SqlParseError extends Error {
  readonly parserMessage: string;

  constructor(parserMessage: string, cause?: unknown) {
    super('无法解析 SQL，请检查语法或数据库类型是否正确。', { cause });
    this.name = 'SqlParseError';
    this.parserMessage = parserMessage;
  }
}
