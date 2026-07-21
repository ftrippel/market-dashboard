function formatBuildTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  } catch {
    return iso;
  }
}

const buildNumber = import.meta.env.VITE_BUILD_NUMBER ?? 'dev';
const buildTime = import.meta.env.VITE_BUILD_TIME ?? '';

export const buildLabel =
  buildNumber === 'dev'
    ? `Build dev · ${formatBuildTime(buildTime || new Date().toISOString())}`
    : `Build ${buildNumber} · ${formatBuildTime(buildTime)}`;
