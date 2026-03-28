import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { User, UserRole } from '@prisma/client';
import { PhotosService } from './photos.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { PresignPhotoDto } from './dto/presign-photo.dto';
import { CompletePhotoDto } from './dto/complete-photo.dto';

@Controller('rooms/:roomId/photos')
@UseGuards(RolesGuard)
export class PhotosController {
  constructor(private readonly photos: PhotosService) {}

  @Post('presign')
  @Roles(UserRole.HOUSEKEEPER, UserRole.SUPERVISOR, UserRole.ADMIN)
  presign(
    @Param('roomId') roomId: string,
    @CurrentUser() user: User,
    @Body() dto: PresignPhotoDto,
  ) {
    return this.photos.presign(roomId, user, dto.contentType ?? 'image/jpeg');
  }

  @Post('complete')
  @Roles(UserRole.HOUSEKEEPER, UserRole.SUPERVISOR, UserRole.ADMIN)
  complete(@Param('roomId') roomId: string, @CurrentUser() user: User, @Body() dto: CompletePhotoDto) {
    return this.photos.completePhoto(roomId, user, dto);
  }

  @Get()
  @Roles(UserRole.HOUSEKEEPER, UserRole.SUPERVISOR, UserRole.RECEPTION, UserRole.ADMIN)
  timeline(@Param('roomId') roomId: string) {
    return this.photos.timeline(roomId);
  }
}
