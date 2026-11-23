import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateBernTicketLoginDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  /** If omitted or blank, previously stored password is kept */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  password?: string;
}
