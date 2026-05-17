import { Module, forwardRef } from '@nestjs/common';
import { PhotosService } from './photos.service';
import { PhotosController } from './photos.controller';
import { RoomsModule } from '../rooms/rooms.module';
import { EmmaModule } from '../emma/emma.module';

@Module({
  imports: [RoomsModule, forwardRef(() => EmmaModule)],
  controllers: [PhotosController],
  providers: [PhotosService],
})
export class PhotosModule {}
