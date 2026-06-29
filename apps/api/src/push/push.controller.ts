import { Body, Controller, Delete, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DeletePushSubscriptionDto, PushSubscriptionDto } from './dto/push-subscription.dto';
import { PushService } from './push.service';

@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('vapid-public-key')
  vapidPublicKey() {
    const key = this.push.getVapidPublicKey();
    return { publicKey: key };
  }

  @Post('subscriptions')
  subscribe(@CurrentUser('id') userId: string, @Body() dto: PushSubscriptionDto) {
    return this.push.upsertSubscription(userId, dto);
  }

  @Delete('subscriptions')
  unsubscribe(@CurrentUser('id') userId: string, @Body() dto: DeletePushSubscriptionDto) {
    return this.push.removeSubscription(dto.endpoint, userId);
  }
}
