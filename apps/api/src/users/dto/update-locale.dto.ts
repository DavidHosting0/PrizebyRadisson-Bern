import { IsIn, IsString } from 'class-validator';

export const SUPPORTED_LOCALES = ['de', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export class UpdateLocaleDto {
  @IsString()
  @IsIn(SUPPORTED_LOCALES)
  locale!: SupportedLocale;
}
