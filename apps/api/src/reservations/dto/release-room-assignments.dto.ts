import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

export class ReleaseRoomAssignmentsDto {
  @IsArray()
  @ArrayMaxSize(80)
  @IsString({ each: true })
  reservationIds!: string[];
}
