// Attachment byte transport (desktop only). Filenames + validation live in
// @devnote/core (`attachments.ts`); the native side (`attachments.rs`)
// re-validates before touching disk.
import { invoke } from './mirror';

/** Save bytes under `.attachments/`; resolves the mirror-relative path. */
export async function saveAttachmentBytes(relativePath: string, bytes: Uint8Array): Promise<string> {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return invoke<string>('attachment_write', {
    relativePath,
    base64Content: btoa(binary),
  });
}

/** Load bytes for preview blob URLs. */
export async function loadAttachmentBytes(relativePath: string): Promise<Uint8Array> {
  const base64 = await invoke<string>('attachment_read', { relativePath });
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
