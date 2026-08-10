import { IsIn, IsString } from 'class-validator';
import { SUPPORTED_LOCALES, type SupportedLocale } from '@housekeeping/shared';

export class UpdateLocaleDto {
  @IsString()
  @IsIn([...SUPPORTED_LOCALES])
  locale!: SupportedLocale;
}
