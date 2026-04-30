import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Guard for endpoints called by the Favur browser extension.
 *
 * Auth header: `Authorization: Bearer <apiKey>` where apiKey matches
 * the value stored in `FavurIntegration.apiKey`. We compare with
 * `timingSafeEqual` to avoid leaking the key via timing.
 *
 * Routes guarded by this guard MUST be marked `@Public()` so the global
 * JwtAuthGuard skips them.
 */
@Injectable()
export class FavurApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const auth = (Array.isArray(req.headers.authorization)
      ? req.headers.authorization[0]
      : req.headers.authorization) ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (!match) throw new UnauthorizedException('Missing extension API key');
    const provided = match[1];

    const config = await this.prisma.favurIntegration.findUnique({
      where: { id: 'default' },
      select: { apiKey: true },
    });
    if (!config?.apiKey) {
      throw new UnauthorizedException('Favur extension is not configured yet');
    }
    const a = Buffer.from(provided);
    const b = Buffer.from(config.apiKey);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid extension API key');
    }
    return true;
  }
}
