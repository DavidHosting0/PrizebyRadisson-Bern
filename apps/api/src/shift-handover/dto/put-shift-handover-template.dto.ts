import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator';

export class PutShiftHandoverTemplateTaskDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MinLength(1)
  label!: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class PutShiftHandoverTemplateDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PutShiftHandoverTemplateTaskDto)
  tasks!: PutShiftHandoverTemplateTaskDto[];
}
