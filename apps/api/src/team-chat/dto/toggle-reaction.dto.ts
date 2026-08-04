import { IsString, MaxLength, MinLength } from 'class-validator';

export class ToggleReactionDto {
  /** Unicode emoji or short emoji sequence (e.g. "👍", "❤️"). */
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  emoji!: string;
}
