import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Patch DTO for AI service credentials. Currently only OpenAI; add fields here
 * if a second provider gets wired in.
 *
 * The key is stored AES-GCM-encrypted; passing an empty string keeps the
 * existing value untouched (consistent with the EMMA/Puzzle credential
 * patterns).
 */
export class UpdateAiConfigDto {
  /** OpenAI secret API key (`sk-…`). Empty string ⇒ keep what's stored. */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  openaiApiKey?: string;

  /** Model identifier for ticket analysis (default: `gpt-4o-mini`). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  openaiModel?: string;
}
