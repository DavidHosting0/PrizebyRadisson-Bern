import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { EmmaService } from './emma.service';

/** Fire-and-forget EMMA room-status sync after housekeeping room activity. */
@Injectable()
export class EmmaRoomSyncTrigger {
  constructor(
    @Inject(forwardRef(() => EmmaService))
    private readonly emma: EmmaService,
  ) {}

  afterRoomActivity(source: string): void {
    this.emma.scheduleRoomStatusSync(source);
  }
}
