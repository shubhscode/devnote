import { describe, expect, it } from 'vitest';
import {
  ATTACHMENTS_DIR,
  attachmentAlt,
  attachmentFilename,
  attachmentPath,
  checkAttachment,
  isAttachmentRef,
  MAX_ATTACHMENT_BYTES,
} from './attachments';

describe('attachmentPath', () => {
  it('builds a stable, namespaced, mirror-relative path', () => {
    expect(attachmentPath('noteid123456', 'm3xk2q', 'Screen Shot.png')).toBe(
      '.attachments/noteid12-m3xk2q-screen-shot.png',
    );
  });

  it('lowercases ext and never escapes the dir', () => {
    const p = attachmentPath('n1', 'a', '../../evil.JPG');
    expect(p.startsWith(`${ATTACHMENTS_DIR}/`)).toBe(true);
    expect(p).not.toContain('..');
    expect(p.endsWith('.jpg')).toBe(true);
  });

  it('repeat pastes of one name differ by nonce', () => {
    expect(attachmentPath('n1', 'aaa', 'a.png')).not.toBe(attachmentPath('n1', 'bbb', 'a.png'));
  });
});

describe('isAttachmentRef', () => {
  it('owns .attachments refs only', () => {
    expect(isAttachmentRef('.attachments/a-b-c.png')).toBe(true);
    expect(isAttachmentRef('https://x/y.png')).toBe(false);
    expect(isAttachmentRef('./photo.png')).toBe(false);
    expect(isAttachmentRef('data:image/png;base64,x')).toBe(false);
  });
});

describe('attachmentAlt', () => {
  it('recovers the human name from a namespaced file', () => {
    expect(attachmentAlt('.attachments/noteid12-m3xk2q-screen-shot.png')).toBe('screen-shot.png');
  });
});

describe('checkAttachment', () => {
  it('accepts ordinary images under the cap', () => {
    expect(checkAttachment('a.png', 'image/png', 1024)).toEqual({ ok: true });
    expect(checkAttachment('a.JPG', 'image/jpeg', MAX_ATTACHMENT_BYTES)).toEqual({ ok: true });
  });

  it('rejects non-images, bad exts, and oversize files with reasons', () => {
    expect(checkAttachment('a.pdf', 'application/pdf', 10).ok).toBe(false);
    expect(checkAttachment('a.png', 'text/plain', 10).ok).toBe(false);
    expect(checkAttachment('a.bmp', 'image/bmp', 10)).toEqual({
      ok: false,
      reason: `".bmp" isn't an accepted image type`,
    });
    const big = checkAttachment('a.png', 'image/png', MAX_ATTACHMENT_BYTES + 1);
    expect(big.ok).toBe(false);
    expect(big.reason).toContain('10 MiB');
  });
});

describe('attachmentFilename', () => {
  it('omits the dot on ext-less names (rejected upstream anyway)', () => {
    expect(attachmentFilename('noteid123456', 'n', 'paste')).toBe('noteid12-n-paste');
  });
});
