import { Module, forwardRef } from '@nestjs/common';
import { PhotosService } from './photos.service';
import { PhotosController } from './photos.controller';
import { RoomsModule } from '../rooms/rooms.module';
import { EmmaModule } from '../emma/emma.module';
import { InspectionQueueModule } from '../assignments/inspection-queue.module';

@Module({
  imports: [
    forwardRef(() => RoomsModule),
    forwardRef(() => EmmaModule),
    InspectionQueueModule,
  ],
  controllers: [PhotosController],
  providers: [PhotosService],
  exports: [PhotosService],
})
export class PhotosModule {}
