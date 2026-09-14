// Attachment naming + guards (Phase 3a). Pure helpers — the native side
// (`attachments.rs`) enforces the same shape independently; the filename is
// always computed here so both sides agree. v1 = images only.
import { sanitizeSegment, slugify } from './mirror';

/** Mirror-relative dir holding every attachment (NOT hidden — git + zip include it). */
export const ATTACHMENTS_DIR = '.attachments';

/** v1 crystal: pasted/dropped images only. Anything else is rejected loudly. */
export const ATTACHMENT_IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg'] as const;

/** 10 MiB per file — keeps git repos, zips, and full-scan imports sane. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export function isImageMime(mime: string): boolean {
  return mime.toLowerCase().startsWith('image/');
}

export function attachmentExt(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
}

export function isAllowedAttachmentExt(ext: string): boolean {
  return (ATTACHMENT_IMAGE_EXTS as readonly string[]).includes(ext);
}

/**
 * Stable filename: `<noteId8>-<nonce>-<slug>.<ext>`. The nonce (caller-made,
 * e.g. timestamp base36) keeps repeat pastes of one name from colliding;
 * the note prefix keeps renames/moves from orphaning ownership.
 */
export function attachmentFilename(noteId: string, nonce: string, originalName: string): string {
  const ext = attachmentExt(originalName);
  const stem = originalName.includes('.') ? originalName.slice(0, originalName.lastIndexOf('.')) : originalName;
  const safeNonce = sanitizeSegment(nonce).replace(/-/g, '').slice(0, 12) || 'x';
  const suffix = ext === '' ? '' : `.${ext}`;
  return `${noteId.slice(0, 8)}-${safeNonce}-${slugify(stem) || 'image'}${suffix}`;
}

/** Mirror-relative path (`Unsaved` guard: never absolute, never `..`). */
export function attachmentPath(noteId: string, nonce: string, originalName: string): string {
  return `${ATTACHMENTS_DIR}/${attachmentFilename(noteId, nonce, originalName)}`;
}

/** True for refs this pipeline owns (`![alt](.attachments/…)`). */
export function isAttachmentRef(url: string): boolean {
  return url === ATTACHMENTS_DIR || url.startsWith(`${ATTACHMENTS_DIR}/`);
}

/** Human label for alt text: `abc12345-xk2-photo.png` → `photo.png`. */
export function attachmentAlt(path: string): string {
  const file = path.split('/').pop() ?? path;
  const parts = file.split('-');
  const ext = attachmentExt(file);
  if (parts.length >= 3 && ext !== '') {
    return `${parts.slice(2).join('-')}`;
  }
  return file;
}

export interface AttachmentCheck {
  ok: boolean;
  /** Machine reason when rejected (surfaced as the notice). */
  reason?: string;
}

/** Validate before any byte moves: mime + ext allowlist + size cap. */
export function checkAttachment(fileName: string, mime: string, byteLength: number): AttachmentCheck {
  if (!isImageMime(mime)) return { ok: false, reason: `Only images for now (got ${mime || 'unknown type'})` };
  const ext = attachmentExt(fileName);
  if (!isAllowedAttachmentExt(ext)) return { ok: false, reason: `".${ext || '?'}" isn't an accepted image type` };
  if (byteLength > MAX_ATTACHMENT_BYTES) {
    return { ok: false, reason: `Image is ${(byteLength / 1048576).toFixed(1)} MiB — cap is 10 MiB` };
  }
  return { ok: true };
}
