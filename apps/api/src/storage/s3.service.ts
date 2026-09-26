import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

@Injectable()
export class S3Service {
  private readonly log = new Logger('S3Service');
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly configured: boolean;
  /** Cache signed GET URLs so polling clients keep a stable img src. */
  private readonly getUrlCache = new Map<string, { url: string; exp: number }>();

  constructor(private readonly config: ConfigService) {
    const region = this.config.get<string>('s3.region') ?? 'us-east-1';
    const endpoint = this.config.get<string>('s3.endpoint');
    const accessKeyId = this.config.get<string>('s3.accessKeyId');
    const secretAccessKey = this.config.get<string>('s3.secretAccessKey');
    this.bucket = this.config.get<string>('s3.bucket') ?? 'housekeeping';
    this.configured = !!(accessKeyId && secretAccessKey);

    if (!this.configured) {
      this.log.warn(
        'S3 credentials missing — photo/avatar uploads will fail until ' +
          'S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY ' +
          'are set in apps/api/.env (or the pm2 environment).',
      );
    } else {
      this.log.log(
        `S3 configured: bucket=${this.bucket} endpoint=${endpoint ?? 'aws default'} region=${region}`,
      );
    }

    this.client = new S3Client({
      region,
      endpoint: endpoint || undefined,
      forcePathStyle: this.config.get<boolean>('s3.forcePathStyle') ?? !!endpoint,
      credentials:
        accessKeyId && secretAccessKey
          ? { accessKeyId, secretAccessKey }
          : undefined,
    });
  }

  private assertConfigured() {
    if (!this.configured) {
      throw new ServiceUnavailableException(
        'Photo storage is not configured on the server. ' +
          'Set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY ' +
          'in apps/api/.env (or the pm2 environment) and restart the API.',
      );
    }
  }

  async presignPut(key: string, contentType: string, expiresSec = 3600) {
    this.assertConfigured();
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    const url = await getSignedUrl(this.client, cmd, { expiresIn: expiresSec });
    return { url, key, bucket: this.bucket };
  }

  async headObject(key: string): Promise<{ contentType?: string; contentLength?: number } | null> {
    if (!this.configured) return null;
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { contentType: res.ContentType, contentLength: res.ContentLength };
    } catch (e) {
      this.log.debug(`headObject failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  /** First bytes only — used to reject MP4/MOV that were uploaded with an image Content-Type. */
  async getObjectPrefix(key: string, byteCount = 16): Promise<Uint8Array | null> {
    if (!this.configured) return null;
    try {
      const res = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Range: `bytes=0-${Math.max(0, byteCount - 1)}`,
        }),
      );
      const bytes = await res.Body?.transformToByteArray();
      return bytes ? Uint8Array.from(bytes) : null;
    } catch (e) {
      this.log.debug(`getObjectPrefix failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  async presignGet(key: string, expiresSec = 900): Promise<{ url: string | null }> {
    // Missing creds -> return null instead of throwing, so list/read endpoints
    // that include optional photo/avatar URLs keep working. Uploads (presignPut)
    // still throw ServiceUnavailable so the UI can surface it clearly.
    if (!this.configured) return { url: null };

    // Reuse the same signed URL for a while so chat/avatar <img> src stays stable
    // across polling (new signatures force browsers to re-download the image).
    const now = Date.now();
    const cached = this.getUrlCache.get(key);
    if (cached && cached.exp - now > 120_000) {
      return { url: cached.url };
    }

    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const url = await getSignedUrl(this.client, cmd, { expiresIn: expiresSec });
    this.getUrlCache.set(key, { url, exp: now + expiresSec * 1000 });
    // Bound cache size (simple eviction of oldest half when large)
    if (this.getUrlCache.size > 2000) {
      let i = 0;
      for (const k of this.getUrlCache.keys()) {
        this.getUrlCache.delete(k);
        if (++i > 1000) break;
      }
    }
    return { url };
  }

  buildRoomPhotoKey(roomId: string, ext = 'jpg') {
    return `rooms/${roomId}/photos/${randomUUID()}.${ext}`;
  }

  buildLostFoundKey(ext = 'jpg') {
    return `lost-found/${randomUUID()}.${ext}`;
  }

  buildDamageReportKey(ext = 'jpg') {
    return `damage-reports/${randomUUID()}.${ext}`;
  }

  buildRestantEvidenceKey(taskId: string, ext = 'jpg') {
    return `restant-evidence/${taskId}/${randomUUID()}.${ext}`;
  }

  buildAvatarKey(userId: string, ext = 'jpg') {
    return `avatars/${userId}/${randomUUID()}.${ext}`;
  }

  buildTeamChatKey(ext = 'jpg') {
    return `team-chat/${randomUUID()}.${ext}`;
  }
}
