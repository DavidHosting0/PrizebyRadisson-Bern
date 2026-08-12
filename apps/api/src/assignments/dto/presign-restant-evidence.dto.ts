import { IsNotEmpty, IsString } from 'class-validator';

export class PresignRestantEvidenceDto {
  @IsString()
  @IsNotEmpty()
  contentType!: string;
}
