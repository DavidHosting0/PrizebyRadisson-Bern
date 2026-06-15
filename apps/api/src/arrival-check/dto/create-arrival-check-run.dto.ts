import { ArrayNotEmpty, IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateArrivalCheckRunDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  reservationIds!: string[];

  @IsOptional()
  @IsString()
  hotelId?: string;

  @IsOptional()
  @IsBoolean()
  forceRerun?: boolean;
}
