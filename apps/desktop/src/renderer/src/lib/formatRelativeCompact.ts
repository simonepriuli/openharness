/** Compact relative label for sidenav hover (e.g. "16m", "3h"). */
export function formatRelativeCompact(iso: string | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return `${abs}s`;
  if (abs < 3600) return `${Math.round(abs / 60)}m`;
  if (abs < 86400) return `${Math.round(abs / 3600)}h`;
  if (abs < 604800) return `${Math.round(abs / 86400)}d`;
  if (abs < 2592000) return `${Math.round(abs / 604800)}w`;
  return `${Math.round(abs / 2592000)}mo`;
}
