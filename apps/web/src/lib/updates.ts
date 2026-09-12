// Update-available check against GitHub Releases (lightweight notice path —
// no signing keys, no auto-install; the signed Tauri updater stays a PLAN 6c item).
// Offline-first: every failure resolves to null — never block launch, never nag.
export interface ReleaseInfo {
  tag: string;
  name: string;
  url: string;
  notes?: string;
}

/** `v0.0.1` → [0, 0, 1]. Non-numeric segments count as 0. */
export function normalizeVersion(v: string): number[] {
  return v
    .trim()
    .replace(/^[vV]/, '')
    .split('.')
    .map((p) => {
      const n = parseInt(p, 10);
      return Number.isFinite(n) ? n : 0;
    });
}

/** Numeric segment compare (`0.0.10` > `0.0.9`). Equal/malformed → false. */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = normalizeVersion(latest);
  const b = normalizeVersion(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

export async function fetchLatestRelease(
  owner: string,
  repo: string,
  fetchFn: typeof fetch = fetch,
): Promise<ReleaseInfo | null> {
  const res = await fetchFn(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { tag_name?: unknown; name?: unknown; html_url?: unknown; body?: unknown };
  if (typeof data.tag_name !== 'string' || typeof data.html_url !== 'string') return null;
  return {
    tag: data.tag_name,
    name: typeof data.name === 'string' && data.name !== '' ? data.name : data.tag_name,
    url: data.html_url,
    notes: typeof data.body === 'string' ? data.body : undefined,
  };
}

/** Newer-than-current release, or null (up to date / unreachable / malformed). */
export async function checkForUpdates(
  current: string,
  owner: string,
  repo: string,
  fetchFn: typeof fetch = fetch,
): Promise<ReleaseInfo | null> {
  try {
    const latest = await fetchLatestRelease(owner, repo, fetchFn);
    if (!latest) return null;
    return isNewerVersion(latest.tag, current) ? latest : null;
  } catch {
    return null;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** True when no check in the last 24h (launch gate — one request/day max). */
export function shouldRecheck(lastCheckedAt: number | null, now: number = Date.now()): boolean {
  return lastCheckedAt === null || !Number.isFinite(lastCheckedAt) || now - lastCheckedAt >= DAY_MS;
}
