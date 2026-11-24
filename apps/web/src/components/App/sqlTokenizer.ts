export interface HighlightToken {
  content: string;
  color?: string;
  fontStyle?: number;
}

export interface HighlightResult {
  fg: string;
  tokens: HighlightToken[][];
}

const PALETTES = {
  light: {
    fg: '#383a42',
    keyword: '#a626a4',
    type: '#c18401',
    string: '#50a14f',
    comment: '#a0a1a7',
    number: '#986801',
    identifier: '#4078f2',
    operator: '#0184bc',
  },
  dark: {
    fg: '#abb2bf',
    keyword: '#c678dd',
    type: '#e5c07b',
    string: '#98c379',
    comment: '#7f848e',
    number: '#d19a66',
    identifier: '#61afef',
    operator: '#56b6c2',
  },
} as const;

const SQL_KEYWORDS = new Set([
  'ADD',
  'AFTER',
  'ALL',
  'ALTER',
  'AND',
  'AS',
  'ASC',
  'AUTO_INCREMENT',
  'AUTOINCREMENT',
  'BEFORE',
  'BEGIN',
  'BETWEEN',
  'BY',
  'CASCADE',
  'CASE',
  'CHARSET',
  'CHECK',
  'CLUSTERED',
  'COLLATE',
  'COLUMN',
  'COMMENT',
  'COMMIT',
  'CONSTRAINT',
  'CREATE',
  'CURRENT_DATE',
  'CURRENT_TIME',
  'CURRENT_TIMESTAMP',
  'DATABASE',
  'DECLARE',
  'DEFAULT',
  'DELETE',
  'DELIMITER',
  'DESC',
  'DISTINCT',
  'DISTRIBUTED',
  'DO',
  'DROP',
  'EACH',
  'ELSE',
  'ENABLE',
  'END',
  'ENGINE',
  'EXECUTE',
  'EXISTS',
  'EXTERNAL',
  'FALSE',
  'FILLFACTOR',
  'FOR',
  'FOREIGN',
  'FORMAT',
  'FROM',
  'FULLTEXT',
  'FUNCTION',
  'GENERATED',
  'GRANT',
  'GROUP',
  'HASH',
  'HAVING',
  'IDENTITY',
  'IF',
  'IN',
  'INDEX',
  'INHERITS',
  'INITRANS',
  'INNER',
  'INSERT',
  'INTO',
  'IS',
  'JOIN',
  'KEY',
  'LEFT',
  'LESS',
  'LIKE',
  'LIMIT',
  'LIST',
  'LOCATION',
  'MODIFIED',
  'MODIFY',
  'NEW',
  'NO',
  'NOT',
  'NULL',
  'OFFSET',
  'OLD',
  'ON',
  'OPTION',
  'OR',
  'ORDER',
  'OUTER',
  'PARTITION',
  'PARTITIONS',
  'PCTFREE',
  'PRIMARY',
  'PRIVILEGES',
  'PROCEDURE',
  'RANGE',
  'REFERENCES',
  'RENAME',
  'REPLACE',
  'RESTRICT',
  'RETURN',
  'RETURNS',
  'REVOKE',
  'RIGHT',
  'ROW',
  'ROW_FORMAT',
  'SCHEMA',
  'SELECT',
  'SET',
  'SORTED',
  'SPATIAL',
  'STORAGE',
  'STORED',
  'TABLE',
  'TABLESPACE',
  'TBLPROPERTIES',
  'TEMPORARY',
  'THAN',
  'THEN',
  'TO',
  'TRIGGER',
  'TRUE',
  'TRUNCATE',
  'UNION',
  'UNIQUE',
  'UNSIGNED',
  'UPDATE',
  'USE',
  'USING',
  'VALUES',
  'VIEW',
  'WHEN',
  'WHERE',
  'WITH',
  'ZEROFILL',
]);

const SQL_TYPES = new Set([
  'ARRAY',
  'BIGINT',
  'BIGSERIAL',
  'BINARY',
  'BIT',
  'BLOB',
  'BOOL',
  'BOOLEAN',
  'BYTEA',
  'CHAR',
  'CHARACTER',
  'CLOB',
  'DATE',
  'DATETIME',
  'DATETIME2',
  'DATETIMEOFFSET',
  'DEC',
  'DECIMAL',
  'DOUBLE',
  'ENUM',
  'FLOAT',
  'FLOAT4',
  'FLOAT8',
  'GEOGRAPHY',
  'GEOMETRY',
  'IMAGE',
  'INT',
  'INT2',
  'INT4',
  'INT8',
  'INTEGER',
  'JSON',
  'JSONB',
  'LONGBLOB',
  'LONGTEXT',
  'MAP',
  'MEDIUMBLOB',
  'MEDIUMINT',
  'MEDIUMTEXT',
  'MONEY',
  'NCHAR',
  'NCLOB',
  'NTEXT',
  'NUMBER',
  'NUMERIC',
  'NVARCHAR',
  'NVARCHAR2',
  'RAW',
  'REAL',
  'SERIAL',
  'SMALLDATETIME',
  'SMALLINT',
  'SMALLMONEY',
  'SMALLSERIAL',
  'STRING',
  'STRUCT',
  'TEXT',
  'TIME',
  'TIMESTAMP',
  'TIMESTAMPTZ',
  'TINYBLOB',
  'TINYINT',
  'TINYTEXT',
  'UNIQUEIDENTIFIER',
  'UUID',
  'VARBINARY',
  'VARCHAR',
  'VARCHAR2',
  'XML',
  'YEAR',
]);

const TOKEN_RE =
  /(--[^\n]*|\/\*[\s\S]*?\*\/|N?'(?:''|\\.|[^'\\])*'|`(?:``|[^`])*`|"(?:""|[^"])*"|\[[^\]]*\]|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_$]*\b|[^\sA-Za-z0-9_'"`[\]-]+|\s+|.)/g;

export function tokenizeSql(code: string, mode: 'light' | 'dark'): HighlightResult {
  const palette = PALETTES[mode];
  const lines: HighlightToken[][] = [[]];
  let currentLine = lines[0];

  const pushText = (content: string, color?: string, fontStyle?: number) => {
    if (!content.includes('\n')) {
      currentLine.push({ content, color, fontStyle });

      return;
    }

    const parts = content.split('\n');

    for (let i = 0; i < parts.length; i += 1) {
      if (i > 0) {
        currentLine = [];
        lines.push(currentLine);
      }

      if (parts[i].length > 0) {
        currentLine.push({ content: parts[i], color, fontStyle });
      }
    }
  };

  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TOKEN_RE.exec(code)) !== null) {
    const raw = match[0];

    if (raw.startsWith('--') || raw.startsWith('/*')) {
      pushText(raw, palette.comment, 1);
    } else if (raw.startsWith("'") || raw.startsWith("N'")) {
      pushText(raw, palette.string);
    } else if (raw.startsWith('`') || raw.startsWith('"') || raw.startsWith('[')) {
      pushText(raw, palette.identifier);
    } else if (/^\d/.test(raw)) {
      pushText(raw, palette.number);
    } else if (/^[A-Za-z_]/.test(raw)) {
      const upper = raw.toUpperCase();

      if (SQL_KEYWORDS.has(upper)) {
        pushText(raw, palette.keyword);
      } else if (SQL_TYPES.has(upper)) {
        pushText(raw, palette.type);
      } else {
        pushText(raw, palette.fg);
      }
    } else if (/^[=<>!+\-*/%|&]+$/.test(raw)) {
      pushText(raw, palette.operator);
    } else {
      pushText(raw, palette.fg);
    }
  }

  return { fg: palette.fg, tokens: lines };
}
