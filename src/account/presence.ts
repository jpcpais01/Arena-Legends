// Online presence, shared by the Firebase code and the UI (kept apart so the
// UI doesn't pull Firebase in): a signed-in game refreshes its shared hero's
// time once a minute while open, and friends read that time.

/** A friend counts as online when their game checked in within this long. */
export const ONLINE_WITHIN = 150_000;

export const isOnline = (seen: number, now = Date.now()) => seen > 0 && now - seen < ONLINE_WITHIN;

/** "Last seen" text for a friend who isn't online: "5m ago", "3h ago", "2d ago". */
export function seenAgo(seen: number, now = Date.now()): string {
  if (!seen) return 'Offline';
  const m = Math.max(1, Math.floor((now - seen) / 60_000));
  if (m < 60) return `Seen ${m}m ago`;
  const hrs = Math.floor(m / 60);
  if (hrs < 24) return `Seen ${hrs}h ago`;
  return `Seen ${Math.floor(hrs / 24)}d ago`;
}
