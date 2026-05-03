import { IsEmail, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

/**
 * Patch DTO for the four-stage EMMA login secrets. All fields are optional;
 * blank password/secret strings are treated as "leave unchanged" so the admin
 * UI can update one credential at a time without re-entering everything.
 */
export class UpdateEmmaLoginDto {
  // Stage 1 — ADFS forms authentication --------------------------------------
  @IsOptional()
  @IsEmail()
  adfsEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  adfsPassword?: string;

  // Stage 2 — RHGMFA TOTP ----------------------------------------------------
  @IsOptional()
  @IsString()
  @MaxLength(128)
  totpSecret?: string;

  // Stage 3 — SAP Fiori logon ------------------------------------------------
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sapUser?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  sapPassword?: string;

  // Stage 4 — Property/operator modal ----------------------------------------
  @IsOptional()
  @IsString()
  @MaxLength(64)
  operatorCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  operatorPassword?: string;

  /** Till for Folio invoice cancellation / payment (exact label from EMMA combobox). */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  tillName?: string;

  /** Optional override for the EMMA Fiori launchpad URL. */
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(512)
  baseUrl?: string;
}
