import { describe, it, expect } from 'vitest';
import { parsePartialJson } from '@/utils/parsePartialJson';

describe('parsePartialJson', () => {
  it('should return null for empty input', () => {
    expect(parsePartialJson('')).toBe(null);
    expect(parsePartialJson('   ')).toBe(null);
  });

  it('should parse complete json and normalize fields', () => {
    const input = JSON.stringify({
      score: 20,
      summary: 'done',
      suggestions: ['a', 'b', 1, 'c', 'd', 'e', 'f'],
    });
    const result = parsePartialJson(input);
    expect(result).toEqual({
      score: 10,
      summary: 'done',
      suggestions: ['a', 'b', 'c', 'd', 'e'],
    });
  });

  it('should parse partial fields', () => {
    const input = '{"score": 3, "summary": "hello"';
    const result = parsePartialJson(input);
    expect(result?.score).toBe(3);
    expect(result?.summary).toBe('hello');
  });

  it('should parse partial suggestions array', () => {
    const input = '{"suggestions": ["a", "b", "c"';
    const result = parsePartialJson(input);
    expect(result?.suggestions).toEqual(['a', 'b', 'c']);
  });

  it('should unescape escaped characters', () => {
    const input = '{"summary": "line1\\nline2"}';
    const result = parsePartialJson(input);
    expect(result?.summary).toBe('line1\nline2');
  });
});
