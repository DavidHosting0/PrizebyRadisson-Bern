import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class UpsertBreakfastEntryDto {
  @IsOptional()
  @IsString()
  roomId?: string;

  @IsOptional()
  @IsString()
  roomNumber?: string;

  @IsInt()
  @Min(1)
  @Max(20)
  persons!: number;

  @IsOptional()
  @IsString()
  serviceDate?: string;

  @IsOptional()
  @IsString()
  reservationId?: string | null;
}

export class ServeBreakfastEntryDto {
  @IsBoolean()
  served!: boolean;
}

export class CreateBreakfastWishDto {
  @IsString()
  @MinLength(1)
  roomId!: string;

  @IsString()
  @MinLength(1)
  serviceDate!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  tags!: string[];

  @IsOptional()
  @IsString()
  note?: string | null;
}

export class UpdateBreakfastWishDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  note?: string | null;

  @IsOptional()
  @IsString()
  status?: 'OPEN' | 'DONE' | 'CANCELLED';

  @IsOptional()
  @IsString()
  serviceDate?: string;
}
