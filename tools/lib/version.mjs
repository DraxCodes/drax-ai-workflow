/**
 * Version comparison for the requirement registry and update announcements.
 * Only the numeric major.minor.patch prefix matters; pre-release suffixes are
 * ignored so `0.6.0-rc.1` and `0.6.0` compare equal for announcement purposes.
 */
export function parseVersion(value) {
  return String(value ?? "")
    .trim()
    .replace(/^v/i, "")
    .split(/[.+-]/)
    .filter((part) => part.length > 0)
    .slice(0, 3)
    .map((part) => {
      const number = Number.parseInt(part, 10);
      return Number.isFinite(number) ? number : 0;
    });
}

/** -1, 0 or 1. Missing segments count as zero. */
export function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let i = 0; i < 3; i += 1) {
    const delta = (left[i] ?? 0) - (right[i] ?? 0);
    if (delta !== 0) return delta > 0 ? 1 : -1;
  }
  return 0;
}