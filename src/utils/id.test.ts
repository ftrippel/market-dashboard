import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUuid } from './id';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('createUuid', () => {
  it('uses crypto.randomUUID when it is available', () => {
    const randomUUID = vi.fn(() => '00000000-0000-4000-8000-000000000001');
    vi.stubGlobal('crypto', { randomUUID });

    expect(createUuid()).toBe('00000000-0000-4000-8000-000000000001');
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it('uses crypto.getRandomValues when randomUUID is unavailable', () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.fill(0xab);
      return bytes;
    });
    vi.stubGlobal('crypto', { getRandomValues });

    expect(createUuid()).toBe('abababab-abab-4bab-abab-abababababab');
    expect(getRandomValues).toHaveBeenCalledOnce();
  });

  it('falls back when the Web Crypto API is unavailable', () => {
    vi.stubGlobal('crypto', undefined);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    expect(createUuid()).toBe('80808080-8080-4080-8080-808080808080');
  });
});
