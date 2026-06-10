import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class MoveFolioChargeDto {
  @IsString()
  @IsNotEmpty()
  sourceFolioId!: string;

  @IsString()
  @IsNotEmpty()
  chargeRowId!: string;

  @IsString()
  @IsNotEmpty()
  destinationFolioId!: string;

  @IsOptional()
  @IsString()
  hotelId?: string;
}
