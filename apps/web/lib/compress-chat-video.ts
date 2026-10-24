import { TEAM_CHAT_MAX_STORED_VIDEO_BYTES } from '@housekeeping/shared';

const TARGET_MAX_EDGE = 1280;
const TARGET_VIDEO_BPS = 1_200_000;
const TARGET_AUDIO_BPS = 96_000;
/** Skip re-encode when already small enough for chat. */
const SKIP_COMPRESS_BYTES = 4 * 1024 * 1024;

function pickRecorderMime(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];
  for (const mime of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return 'video/webm';
}

function waitForEvent(target: EventTarget, event: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('VIDEO_LOAD_TIMEOUT')), timeoutMs);
    const onOk = () => {
      clearTimeout(t);
      target.removeEventListener(event, onOk);
      resolve();
    };
    target.addEventListener(event, onOk, { once: true });
  });
}

function captureVideoStream(video: HTMLVideoElement): MediaStream | null {
  const anyVideo = video as HTMLVideoElement & {
    captureStream?: (frameRate?: number) => MediaStream;
    mozCaptureStream?: (frameRate?: number) => MediaStream;
  };
  try {
    if (typeof anyVideo.captureStream === 'function') return anyVideo.captureStream(30);
    if (typeof anyVideo.mozCaptureStream === 'function') return anyVideo.mozCaptureStream(30);
  } catch {
    return null;
  }
  return null;
}

/**
 * Re-encode a gallery video to ~720p / ~1.2 Mbps (WebM or MP4) for chat upload.
 * Falls back to the original when already small or when the browser cannot re-encode
 * and the file is still under the stored size cap.
 */
export async function compressChatVideo(file: File): Promise<File> {
  if (file.size <= SKIP_COMPRESS_BYTES && /video\/(mp4|webm)/i.test(file.type || '')) {
    return file;
  }

  if (typeof MediaRecorder === 'undefined' || typeof document === 'undefined') {
    if (file.size <= TEAM_CHAT_MAX_STORED_VIDEO_BYTES) return file;
    throw new Error('VIDEO_COMPRESS_UNSUPPORTED');
  }

  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = objectUrl;

  try {
    await waitForEvent(video, 'loadedmetadata', 20_000);
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      throw new Error('VIDEO_INVALID');
    }

    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;
    const scale = Math.min(1, TARGET_MAX_EDGE / Math.max(vw, vh));
    const outW = Math.max(2, Math.round((vw * scale) / 2) * 2);
    const outH = Math.max(2, Math.round((vh * scale) / 2) * 2);

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx || typeof canvas.captureStream !== 'function') {
      if (file.size <= TEAM_CHAT_MAX_STORED_VIDEO_BYTES) return file;
      throw new Error('VIDEO_COMPRESS_UNSUPPORTED');
    }

    const canvasStream = canvas.captureStream(30);
    const sourceStream = captureVideoStream(video);
    if (sourceStream) {
      for (const track of sourceStream.getAudioTracks()) {
        canvasStream.addTrack(track);
      }
    }

    const mime = pickRecorderMime();
    const recorder = new MediaRecorder(canvasStream, {
      mimeType: mime,
      videoBitsPerSecond: TARGET_VIDEO_BPS,
      audioBitsPerSecond: TARGET_AUDIO_BPS,
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    const stopped = new Promise<void>((resolve, reject) => {
      recorder.onstop = () => resolve();
      recorder.onerror = () => reject(new Error('VIDEO_COMPRESS_FAILED'));
    });

    video.currentTime = 0;
    await video.play().catch(() => undefined);
    recorder.start(250);

    let raf = 0;
    const draw = () => {
      if (!video.paused && !video.ended) {
        ctx.drawImage(video, 0, 0, outW, outH);
        raf = requestAnimationFrame(draw);
      }
    };
    raf = requestAnimationFrame(draw);

    await new Promise<void>((resolve, reject) => {
      const finish = () => resolve();
      const fail = () => reject(new Error('VIDEO_PLAYBACK_FAILED'));
      video.addEventListener('ended', finish, { once: true });
      video.addEventListener('error', fail, { once: true });
      const maxMs = Math.min(Math.max(video.duration, 1) * 1000 + 8_000, 3 * 60_000);
      setTimeout(() => {
        try {
          video.pause();
        } catch {
          /* ignore */
        }
        finish();
      }, maxMs);
    });

    cancelAnimationFrame(raf);
    ctx.drawImage(video, 0, 0, outW, outH);
    if (recorder.state !== 'inactive') recorder.stop();
    await stopped;

    for (const track of canvasStream.getTracks()) track.stop();
    if (sourceStream) {
      for (const track of sourceStream.getTracks()) track.stop();
    }

    const outType = mime.split(';')[0] || 'video/webm';
    const blob = new Blob(chunks, { type: outType });
    if (blob.size === 0) throw new Error('VIDEO_COMPRESS_FAILED');
    if (blob.size > TEAM_CHAT_MAX_STORED_VIDEO_BYTES) {
      throw new Error('VIDEO_TOO_LARGE_AFTER_COMPRESS');
    }

    const ext = outType.includes('mp4') ? 'mp4' : 'webm';
    const base = (file.name || 'clip').replace(/\.[^.]+$/, '');
    return new File([blob], `${base}.${ext}`, { type: outType, lastModified: Date.now() });
  } catch (err) {
    if (file.size <= TEAM_CHAT_MAX_STORED_VIDEO_BYTES) return file;
    throw err instanceof Error ? err : new Error('VIDEO_COMPRESS_FAILED');
  } finally {
    try {
      video.pause();
    } catch {
      /* ignore */
    }
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}
