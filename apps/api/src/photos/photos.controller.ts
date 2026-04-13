import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PermissionCode, User } from '@prisma/client';
import { PhotosService } from './photos.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PresignPhotoDto } from './dto/presign-photo.dto';
import { CompletePhotoDto } from './dto/complete-photo.dto';

@Controller('rooms/:roomId/photos')
export class PhotosController {
  constructor(private readonly photos: PhotosService) {}

  @Post('presign')
  @RequirePermissions(PermissionCode.PHOTO_UPLOAD)
  presign(
    @Param('roomId') roomId: string,
    @CurrentUser() user: User,
    @Body() dto: PresignPhotoDto,
  ) {
    return this.photos.presign(roomId, user, dto.contentType ?? 'image/jpeg');
  }

  @Post('complete')
  @RequirePermissions(PermissionCode.PHOTO_UPLOAD)
  complete(@Param('roomId') roomId: string, @CurrentUser() user: User, @Body() dto: CompletePhotoDto) {
    return this.photos.completePhoto(roomId, user, dto);
  }

  @Get()
  @RequirePermissions(PermissionCode.PHOTO_TIMELINE_READ)
  timeline(@Param('roomId') roomId: string) {
    return this.photos.timeline(roomId);
  }
}
