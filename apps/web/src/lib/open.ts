import { isTauri } from './mirror';

// External links: system browser on desktop, new tab on web.
// The opener import stays Tauri-only (dynamic) — never bundled for web.
export async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
    return;
  }
  window.open(url, '_blank', 'noopener');
}
