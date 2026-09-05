/**
 * A small persisted record of milestone toasts already celebrated (see
 * use-milestone-celebration.ts) — the toast itself is transient, but the
 * notification bell needs something to still be there after it fades, so
 * every celebrated crossing gets one entry here too. Capped at the last
 * 10 so a veteran rep's browser doesn't grow this forever.
 */
const KEY = "bee_milestone_notification_log_v1";

export interface MilestoneLogEntry {
  count: number;
  timestamp: string;
}

export function recordMilestoneNotification(count: number): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(KEY);
    const list: MilestoneLogEntry[] = raw ? JSON.parse(raw) : [];
    list.push({ count, timestamp: new Date().toISOString() });
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(-10)));
  } catch {
    // Storage unavailable — the toast still fired, just won't persist in the bell.
  }
}

export function readMilestoneNotifications(): MilestoneLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
