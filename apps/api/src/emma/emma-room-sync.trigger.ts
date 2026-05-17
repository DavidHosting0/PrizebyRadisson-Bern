import { Injectable } from '@nestjs/common';
import { EmmaService } from './emma.service';

/** Fire-and-forget EMMA room-status sync after housekeeping room activity. */
@Injectable()
export class EmmaRoomSyncTrigger {
  constructor(private readonly emma: EmmaService) {}

  afterRoomActivity(source: string): void {
    this.emma.scheduleRoomStatusSync(source);
  }
}
