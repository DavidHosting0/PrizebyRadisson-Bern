import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePuzzleLoginDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  /** If omitted or blank, previously stored password is kept */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  password?: string;

  /** TOTP seed (base32); if omitted or blank, previously stored seed is kept */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  totpSecret?: string;
}
