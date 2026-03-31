import { describe, it, expect } from 'vitest';
import { parsePartialJson } from '@/utils/parsePartialJson';

describe('parsePartialJson', () => {
  it('should return null for empty input', () => {
    expect(parsePartialJson('')).toBe(null);
    expect(parsePartialJson('   ')).toBe(null);
  });

  it('should return null for null or undefined input', () => {
    expect(parsePartialJson(null as unknown as string)).toBe(null);
    expect(parsePartialJson(undefined as unknown as string)).toBe(null);
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

  it('should handle partial summary without closing quote', () => {
    const input = '{"score": 5, "summary": "partial text';
    const result = parsePartialJson(input);
    expect(result?.score).toBe(5);
    expect(result?.summary).toBe('partial text');
  });

  it('should handle incomplete suggestions array', () => {
    // New behavior: only complete items are returned to avoid rendering partial content
    const input = '{"suggestions": ["item1", "item2';
    const result = parsePartialJson(input);
    expect(result?.suggestions).toEqual(['item1']);
  });

  it('should handle suggestions with escaped quotes', () => {
    const input = '{"suggestions": ["use \\"quotes\\" here", "normal"]';
    const result = parsePartialJson(input);
    expect(result?.suggestions).toEqual(['use "quotes" here', 'normal']);
  });

  it('should handle suggestions with special characters', () => {
    const input = '{"suggestions": ["line1\\nline2", "tab\\there"]';
    const result = parsePartialJson(input);
    expect(result?.suggestions).toEqual(['line1\nline2', 'tab\there']);
  });

  it('should handle score with decimal value', () => {
    const input = '{"score": 7.5, "summary": "test"}';
    const result = parsePartialJson(input);
    expect(result?.score).toBe(7.5);
  });

  it('should clamp score to range 1-10', () => {
    const input = '{"score": 15, "summary": "test"}';
    const result = parsePartialJson(input);
    expect(result?.score).toBe(10);

    const input2 = '{"score": -5, "summary": "test"}';
    const result2 = parsePartialJson(input2);
    expect(result2?.score).toBe(1);
  });

  it('should handle empty suggestions array', () => {
    const input = '{"suggestions": []}';
    const result = parsePartialJson(input);
    expect(result?.suggestions).toEqual([]);
  });

  it('should handle only score field', () => {
    const input = '{"score": 8}';
    const result = parsePartialJson(input);
    expect(result?.score).toBe(8);
    expect(result?.summary).toBeUndefined();
    expect(result?.suggestions).toBeUndefined();
  });

  it('should handle only summary field', () => {
    const input = '{"summary": "only summary"}';
    const result = parsePartialJson(input);
    expect(result?.score).toBeUndefined();
    expect(result?.summary).toBe('only summary');
    expect(result?.suggestions).toBeUndefined();
  });

  it('should handle only suggestions field', () => {
    const input = '{"suggestions": ["a", "b"]}';
    const result = parsePartialJson(input);
    expect(result?.score).toBeUndefined();
    expect(result?.summary).toBeUndefined();
    expect(result?.suggestions).toEqual(['a', 'b']);
  });

  it('should handle malformed json gracefully', () => {
    const input = 'not json at all';
    const result = parsePartialJson(input);
    expect(result).toBeNull();
  });

  it('should handle partial json with only opening brace', () => {
    const input = '{';
    const result = parsePartialJson(input);
    expect(result).toBeNull();
  });

  it('should handle partial json with incomplete field', () => {
    const input = '{"sco';
    const result = parsePartialJson(input);
    expect(result).toBeNull();
  });

  it('should limit suggestions to 5 items', () => {
    const input = JSON.stringify({
      suggestions: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    });
    const result = parsePartialJson(input);
    expect(result?.suggestions).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('should allow objects in suggestions array', () => {
    // Now objects are supported for StructuredSuggestion
    const input = JSON.stringify({
      suggestions: ['a', { id: 'sug_1', description: 'test' }, 'b'],
    });
    const result = parsePartialJson(input);
    expect(result?.suggestions).toEqual(['a', { id: 'sug_1', description: 'test' }, 'b']);
  });

  it('should handle backslash escaping', () => {
    const input = '{"summary": "path\\\\to\\\\file"}';
    const result = parsePartialJson(input);
    expect(result?.summary).toBe('path\\to\\file');
  });

  it('should handle carriage return escaping', () => {
    const input = '{"summary": "line1\\r\\nline2"}';
    const result = parsePartialJson(input);
    expect(result?.summary).toBe('line1\r\nline2');
  });

  it('should handle tab escaping', () => {
    const input = '{"summary": "col1\\tcol2"}';
    const result = parsePartialJson(input);
    expect(result?.summary).toBe('col1\tcol2');
  });

  it('should skip incomplete objects in suggestions array during streaming', () => {
    // This simulates streaming where an object is partially received
    // Only complete objects should be returned
    const input =
      '{"suggestions": [{"id": "sug_1", "description": "complete"}, {"id": "sug_2", "descr';
    const result = parsePartialJson(input);
    expect(result?.suggestions).toEqual([{ id: 'sug_1', description: 'complete' }]);
  });

  it('should handle mixed complete and incomplete items in array', () => {
    const input = '{"suggestions": ["first", {"id": "sug_1"}, "incomplete';
    const result = parsePartialJson(input);
    expect(result?.suggestions).toEqual(['first', { id: 'sug_1' }]);
  });

  it('should handle nested objects in suggestions', () => {
    const input = JSON.stringify({
      suggestions: [
        {
          id: 'sug_1',
          field: { fieldName: 'test', fieldType: 'VARCHAR(255)' },
        },
      ],
    });
    const result = parsePartialJson(input);
    expect(result?.suggestions).toEqual([
      {
        id: 'sug_1',
        field: { fieldName: 'test', fieldType: 'VARCHAR(255)' },
      },
    ]);
  });
});
