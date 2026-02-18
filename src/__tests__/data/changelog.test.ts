import { describe, it, expect } from 'vitest';
import {
  changelogData,
  changelogDataMap,
  getChangelogData,
} from '@/data/changelog';

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

  it('should expose both zh-CN and en-US changelog datasets', () => {
    expect(changelogDataMap['zh-CN'].entries.length).toBeGreaterThan(0);
    expect(changelogDataMap['en-US'].entries.length).toBeGreaterThan(0);

    expect(getChangelogData('zh-CN').title).toBeTruthy();
    expect(getChangelogData('en-US').title).toBeTruthy();
  });
});
