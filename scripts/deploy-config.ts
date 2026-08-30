const TRIGGERS_SECTION = /(?:^|\n)\s*\[triggers\]\s*(?:#.*)?\n([\s\S]*?)(?=\n\s*\[|$)/;
const CRONS_ASSIGNMENT = /(?:^|\n)\s*crons\s*=\s*\[/;

const stripTomlComments = (input: string) => {
  let result = '';
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quote === '"' && escaped) {
      result += character;
      escaped = false;
      continue;
    }
    if (quote === '"' && character === '\\') {
      result += character;
      escaped = true;
      continue;
    }
    if (quote) {
      result += character;
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      result += character;
      continue;
    }
    if (character === '#') {
      while (index + 1 < input.length && input[index + 1] !== '\n') index += 1;
      continue;
    }
    result += character;
  }
  return result;
};

const readCronsArray = (section: string) => {
  const assignment = CRONS_ASSIGNMENT.exec(section);
  if (!assignment) return null;
  const start = assignment.index + assignment[0].length;
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (let index = start; index < section.length; index += 1) {
    const character = section[index];
    if (quote === '"' && escaped) {
      escaped = false;
      continue;
    }
    if (quote === '"' && character === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === ']') return section.slice(start, index);
  }
  return null;
};

const parseTomlStringArray = (input: string) => {
  const values: string[] = [];
  let index = 0;
  let expectsValue = true;
  while (index < input.length) {
    while (/\s/.test(input[index] ?? '')) index += 1;
    if (index >= input.length) break;
    if (!expectsValue) {
      if (input[index] !== ',') return null;
      expectsValue = true;
      index += 1;
      continue;
    }
    const quote = input[index];
    if (quote !== '"' && quote !== "'") return null;
    const start = index;
    index += 1;
    let escaped = false;
    while (index < input.length) {
      const character = input[index];
      if (quote === '"' && escaped) {
        escaped = false;
      } else if (quote === '"' && character === '\\') {
        escaped = true;
      } else if (character === quote) {
        break;
      }
      index += 1;
    }
    if (index >= input.length) return null;
    const token = input.slice(start, index + 1);
    try {
      values.push(quote === '"' ? (JSON.parse(token) as string) : token.slice(1, -1));
    } catch {
      return null;
    }
    expectsValue = false;
    index += 1;
  }
  return values;
};

export const assertAIUsageCronConfigured = (config: string, configPath: string) => {
  const triggers = TRIGGERS_SECTION.exec(stripTomlComments(config))?.[1];
  const crons = triggers ? readCronsArray(triggers) : null;
  const values = crons === null ? null : parseTomlStringArray(crons);
  if (!values?.some((value) => value.trim().length > 0)) {
    throw new Error(`${configPath} must configure a non-empty [triggers].crons schedule`);
  }
};
