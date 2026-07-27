import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { isOlderBuild, parseNumericBuildNumber } from './buildVersion';

describe('build version checks', () => {
  it('is enabled by default', () => {
    expect(config.sync.enableBuildVersionCheck).toBe(true);
  });

  it('orders numeric production builds', () => {
    expect(isOlderBuild('100', '101')).toBe(true);
    expect(isOlderBuild('101', '101')).toBe(false);
    expect(isOlderBuild('102', '101')).toBe(false);
  });

  it('does not order development or malformed builds', () => {
    expect(parseNumericBuildNumber('dev')).toBeNull();
    expect(isOlderBuild('dev', '101')).toBe(false);
    expect(isOlderBuild('100', undefined)).toBe(false);
  });
});
