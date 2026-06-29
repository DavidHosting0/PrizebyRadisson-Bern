import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class PushSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  endpoint!: string;

  @IsString()
  @IsNotEmpty()
  p256dh!: string;

  @IsString()
  @IsNotEmpty()
  auth!: string;

  @IsOptional()
  @IsString()
  userAgent?: string;
}

export class DeletePushSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  endpoint!: string;
}
