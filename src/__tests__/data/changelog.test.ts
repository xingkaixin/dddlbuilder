import { describe, it, expect } from 'vitest';
import { changelogData } from '@/data/changelog';

describe('changelogData', () => {
  it('should contain basic metadata and entries', () => {
    expect(changelogData.title).toBeTruthy();
    expect(changelogData.description).toBeTruthy();
    expect(changelogData.entries.length).toBeGreaterThan(0);
  });

  it('should have well-formed entries', () => {
    for (const entry of changelogData.entries) {
      expect(entry.version).toBeTruthy();
      expect(entry.date).toBeTruthy();
      expect(entry.content).toBeTruthy();
    }
  });
});
