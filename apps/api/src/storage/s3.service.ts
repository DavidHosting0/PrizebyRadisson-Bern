import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

@Injectable()
export class S3Service {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    const region = this.config.get<string>('s3.region') ?? 'us-east-1';
    const endpoint = this.config.get<string>('s3.endpoint');
    const accessKeyId = this.config.get<string>('s3.accessKeyId');
    const secretAccessKey = this.config.get<string>('s3.secretAccessKey');
    this.bucket = this.config.get<string>('s3.bucket') ?? 'housekeeping';
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

  async presignPut(key: string, contentType: string, expiresSec = 3600) {
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    const url = await getSignedUrl(this.client, cmd, { expiresIn: expiresSec });
    return { url, key, bucket: this.bucket };
  }

  async presignGet(key: string, expiresSec = 900) {
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
