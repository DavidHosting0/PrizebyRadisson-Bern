import { IsUUID } from 'class-validator';

export class CreateAssignmentDto {
  @IsUUID()
  roomId!: string;

  @IsUUID()
  housekeeperUserId!: string;
}
