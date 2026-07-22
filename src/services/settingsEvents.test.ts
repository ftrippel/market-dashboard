import { beforeEach, describe, expect, it } from 'vitest';
import {
  beginCloudSession,
  endCloudSession,
  hasPendingUpload,
  getServerWriteId,
  markPendingUpload,
  setServerWriteId,
  setSyncBase,
} from './settingsEvents';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('cloud session state', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: new MemoryStorage(),
    });
  });

  it('preserves pending edits for reloads and sign-in cycles of the same user', () => {
    beginCloudSession('user-a');
    markPendingUpload('watchlists', true);
    setSyncBase('watchlists', { watchlists: [] });

    endCloudSession();
    beginCloudSession('user-a');

    expect(hasPendingUpload('watchlists')).toBe(true);
  });

  it('clears sync state when a different account signs in', () => {
    beginCloudSession('user-a');
    markPendingUpload('watchlists', true);

    beginCloudSession('user-b');

    expect(hasPendingUpload('watchlists')).toBe(false);
  });

  it('tracks the exact cloud write and clears it when the account changes', () => {
    beginCloudSession('user-a');
    setServerWriteId('watchlists', 'write-a');

    expect(getServerWriteId('watchlists')).toBe('write-a');

    beginCloudSession('user-b');

    expect(getServerWriteId('watchlists')).toBeNull();
  });
});
