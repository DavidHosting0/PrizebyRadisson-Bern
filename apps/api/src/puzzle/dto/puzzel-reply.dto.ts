import { IsOptional, IsString } from 'class-validator';

/** Multipart body for POST /puzzle/tickets/:id/reply (field `attachments` is handled by multer). */
export class PuzzelReplyDto {
  @IsOptional()
  @IsString()
  message?: string;
}
