/** Original file picked in the client before compression. */
export const TEAM_CHAT_MAX_SOURCE_PHOTO_BYTES = 25 * 1024 * 1024;

/** Stored object after upload. Chat photos are compressed to ~0.6MB; videos are much larger. */
export const TEAM_CHAT_MAX_STORED_PHOTO_BYTES = 2.5 * 1024 * 1024;

const VIDEO_NAME = /\.(mp4|m4v|mov|webm|avi|mkv|mpeg|mpg|3gp|qt)$/i;

/** MIME types accepted for the presigned PUT (after client compression). */
const UPLOAD_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

export type TeamChatImageReject = 'video' | 'tooLarge' | 'notImage';

export function isAllowedTeamChatUploadMime(contentType: string): boolean {
  const mime = contentType.toLowerCase().split(';')[0]!.trim();
  return UPLOAD_MIMES.has(mime);
}

/**
 * Client-side guard for the file picker. Empty MIME is allowed when the name
 * looks like an image (some iOS versions omit type); videos are always rejected.
 */
export function rejectTeamChatImageFile(file: {
  type: string;
  name: string;
  size: number;
}): TeamChatImageReject | null {
  const mime = (file.type || '').toLowerCase().split(';')[0]!.trim();
  const name = file.name || '';

  if (mime.startsWith('video/') || VIDEO_NAME.test(name)) return 'video';
  if (file.size > TEAM_CHAT_MAX_SOURCE_PHOTO_BYTES) return 'tooLarge';
  if (mime && !mime.startsWith('image/')) return 'notImage';
  if (mime === 'image/svg+xml' || mime === 'image/tiff' || mime === 'image/bmp') {
    return 'notImage';
  }
  return null;
}

export function isTeamChatPhotoTooLarge(contentLength: number | undefined): boolean {
  return typeof contentLength === 'number' && contentLength > TEAM_CHAT_MAX_STORED_PHOTO_BYTES;
}

export function isTeamChatVideoContentType(contentType: string | undefined): boolean {
  return (contentType ?? '').toLowerCase().startsWith('video/');
}

/** ISO-BMFF `ftyp` brand at offset 8 (HEIC vs MP4/MOV). */
function ftypBrand(bytes: Uint8Array): string {
  if (bytes.length < 12) return '';
  if (String.fromCharCode(bytes[4]!, bytes[5]!, bytes[6]!, bytes[7]!) !== 'ftyp') return '';
  return String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!).replace(/\0/g, '');
}

const HEIC_BRANDS = /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)/i;

export function sniffTeamChatMediaPrefix(bytes: Uint8Array): 'image' | 'video' | 'unknown' {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image';
  }
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image';
  }
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    const four = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!);
    if (four === 'WEBP') return 'image';
  }
  if (bytes.length >= 6) {
    const gif = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!, bytes[4]!, bytes[5]!);
    if (gif.startsWith('GIF87a') || gif.startsWith('GIF89a')) return 'image';
  }
  const brand = ftypBrand(bytes);
  if (brand) {
    if (HEIC_BRANDS.test(brand)) return 'image';
    return 'video';
  }
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return 'video';
  }
  return 'unknown';
}

/** DB returns newest-first (`orderBy createdAt desc` + `take`). Flip for chronological UI. */
export function orderTeamChatWindow<T>(newestFirst: T[], order: 'asc' | 'desc'): T[] {
  return order === 'asc' ? [...newestFirst].reverse() : newestFirst;
}

export type TeamChatMergeMsg = {
  id: string;
  body: string;
  photoUrl?: string | null;
  author: { id: string };
};

/** Insert/replace a chat message, swapping a matching optimistic `temp-` row when the server reply arrives. */
export function mergeTeamChatMessage<T extends TeamChatMergeMsg>(
  messages: T[] | undefined,
  incoming: T,
): T[] {
  const old = messages ?? [];
  const byId = old.findIndex((m) => m.id === incoming.id);
  if (byId >= 0) {
    const next = old.slice();
    next[byId] = incoming;
    return next;
  }
  if (!incoming.id.startsWith('temp-')) {
    const tempIdx = old.findIndex((m) => {
      if (!m.id.startsWith('temp-') || m.author.id !== incoming.author.id) return false;
      if (m.body.trim() || incoming.body.trim()) return m.body === incoming.body;
      return !!(m.photoUrl && incoming.photoUrl);
    });
    if (tempIdx >= 0) {
      const next = old.slice();
      next[tempIdx] = incoming;
      return next;
    }
  }
  return [...old, incoming];
}
