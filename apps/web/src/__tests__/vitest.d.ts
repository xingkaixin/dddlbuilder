import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';
import type { expect } from 'vitest';

declare module 'vitest' {
  interface Matchers<
    R extends void | Promise<void> = void | Promise<void>,
    T = unknown,
  > extends TestingLibraryMatchers<ReturnType<typeof expect.stringContaining>, R> {}
}
