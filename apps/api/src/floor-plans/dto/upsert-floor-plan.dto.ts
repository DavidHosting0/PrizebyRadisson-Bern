import { IsArray } from 'class-validator';

export class UpsertFloorPlanDto {
  @IsArray()
  layout!: Array<Record<string, unknown>>;
}
