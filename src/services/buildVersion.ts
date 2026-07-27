import { CURRENT_SYNC_BUILD_NUMBER } from './settingsEvents';
import { config } from '../config';

export const STALE_BUILD_MESSAGE =
  'A newer app version is available. Reload the app before editing settings.';

interface DeployedBuildInfo {
  buildNumber?: unknown;
}

export function parseNumericBuildNumber(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function isOlderBuild(current: unknown, deployed: unknown): boolean {
  const currentBuild = parseNumericBuildNumber(current);
  const deployedBuild = parseNumericBuildNumber(deployed);
  return currentBuild !== null && deployedBuild !== null && currentBuild < deployedBuild;
}

export async function assertCurrentBuild(): Promise<void> {
  if (!config.sync.enableBuildVersionCheck) return;

  // Local/dev builds are intentionally unordered.
  if (parseNumericBuildNumber(CURRENT_SYNC_BUILD_NUMBER) === null) return;

  let deployed: DeployedBuildInfo;
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}build-version.json`, {
      cache: 'no-store',
    });
    if (!response.ok) return;
    deployed = (await response.json()) as DeployedBuildInfo;
  } catch {
    // Firestore remains the fallback protection when the marker is unreachable.
    return;
  }

  if (isOlderBuild(CURRENT_SYNC_BUILD_NUMBER, deployed.buildNumber)) {
    throw new Error(STALE_BUILD_MESSAGE);
  }
}
