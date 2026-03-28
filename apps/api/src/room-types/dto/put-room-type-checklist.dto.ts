import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

export class ChecklistTemplateTaskInputDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  label!: string;

  /** Short stable key, unique per template (e.g. bed, towels). */
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9_-]*$/i, {
    message: 'code must start with a letter or number and contain only letters, numbers, underscores, or hyphens',
  })
  code!: string;

  @IsInt()
  @Min(0)
  sortOrder!: number;

  @IsBoolean()
  required!: boolean;
}

export class PutRoomTypeChecklistDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChecklistTemplateTaskInputDto)
  tasks!: ChecklistTemplateTaskInputDto[];
}
