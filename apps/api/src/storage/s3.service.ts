import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

@Injectable()
export class S3Service {
  private readonly log = new Logger('S3Service');
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly configured: boolean;

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

  async presignGet(key: string, expiresSec = 900): Promise<{ url: string | null }> {
    // Missing creds -> return null instead of throwing, so list/read endpoints
    // that include optional photo/avatar URLs keep working. Uploads (presignPut)
    // still throw ServiceUnavailable so the UI can surface it clearly.
    if (!this.configured) return { url: null };
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const url = await getSignedUrl(this.client, cmd, { expiresIn: expiresSec });
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

  buildAvatarKey(userId: string, ext = 'jpg') {
    return `avatars/${userId}/${randomUUID()}.${ext}`;
  }
}
