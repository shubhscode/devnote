// Git remote URL validation (pure). Accepts the network forms git takes:
// https:// (or http://) URLs, ssh:// URLs, and scp-like git@host:path.
// Local paths are rejected — devnote sync means a private repo.
export function isValidGitRemote(url: string): boolean {
  const u = url.trim();
  if (u === '' || /\s/.test(u)) return false;
  if (/^https?:\/\/[^/\s]+\/\S+$/.test(u)) return true;
  if (/^ssh:\/\/[^/\s]+\/\S+$/.test(u)) return true;
  if (/^[\w.-]+@[\w.-]+:.+$/.test(u)) return true;
  return false;
}
