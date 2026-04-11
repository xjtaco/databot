/**
 * Format timestamp to locale time string
 */
export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format timestamp to locale date and time string
 */
export function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Get relative time string (e.g., "2 minutes ago")
 */
export function getRelativeTime(timestamp: number, locale: string = 'zh-CN'): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (days > 0) {
    return rtf.format(-days, 'day');
  }
  if (hours > 0) {
    return rtf.format(-hours, 'hour');
  }
  if (minutes > 0) {
    return rtf.format(-minutes, 'minute');
  }
  return rtf.format(-seconds, 'second');
}

/**
 * Format date string to relative time (e.g., "2 minutes ago")
 */
export function formatRelativeTime(dateString: string, locale: string = 'zh-CN'): string {
  const timestamp = new Date(dateString).getTime();
  return getRelativeTime(timestamp, locale);
}

/**
 * Format a date string for session lists: show time for today, MM/DD for older dates.
 */
export function formatSessionTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (date >= today) {
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Format duration between two ISO timestamps.
 * Returns '--' if endIso is null (still running).
 */
export function formatDuration(startIso: string, endIso: string | null): string {
  if (!endIso) return '--';
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  if (mins < 60) return `${mins}m ${remainSecs}s`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hours}h ${remainMins}m`;
}
