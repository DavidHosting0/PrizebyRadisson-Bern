import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, catchError, tap, throwError } from 'rxjs';
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { ActivityLogService } from './activity-log.service';
import { SKIP_ACTIVITY_LOG_KEY } from './skip-activity-log.decorator';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class ActivityLogInterceptor implements NestInterceptor {
  constructor(
    private readonly activityLog: ActivityLogService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_ACTIVITY_LOG_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<Request & { user?: AuthenticatedUser }>();
    const res = http.getResponse<Response>();

    if (!MUTATING_METHODS.has(req.method.toUpperCase())) {
      return next.handle();
    }

    const path = req.originalUrl ?? req.url;
    if (this.activityLog.shouldSkipPath(path)) {
      return next.handle();
    }

    const started = Date.now();
    const actor = req.user;
    const ipAddress = this.clientIp(req);
    const userAgent = req.headers['user-agent'];

    return next.handle().pipe(
      tap((responseBody) => {
        void this.activityLog.record({
          method: req.method,
          path,
          actor: this.resolveActor(actor, path, responseBody, req.body),
          statusCode: res.statusCode,
          success: res.statusCode < 400,
          body: req.body,
          params: req.params as Record<string, string>,
          query: req.query as Record<string, unknown>,
          ipAddress,
          userAgent,
          durationMs: Date.now() - started,
        });
      }),
      catchError((err: { status?: number; message?: string | string[] }) => {
        const statusCode = typeof err?.status === 'number' ? err.status : 500;
        const message = Array.isArray(err?.message)
          ? err.message.join(', ')
          : typeof err?.message === 'string'
            ? err.message
            : 'Request failed';

        void this.activityLog.record({
          method: req.method,
          path,
          actor: this.resolveActor(actor, path, undefined, req.body),
          statusCode,
          success: false,
          errorMessage: message,
          body: req.body,
          params: req.params as Record<string, string>,
          query: req.query as Record<string, unknown>,
          ipAddress,
          userAgent,
          durationMs: Date.now() - started,
        });

        return throwError(() => err);
      }),
    );
  }

  private clientIp(req: Request): string | undefined {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length) {
      return forwarded.split(',')[0]?.trim();
    }
    return req.ip || req.socket?.remoteAddress;
  }

  private resolveActor(
    actor: AuthenticatedUser | undefined,
    path: string,
    responseBody?: unknown,
    requestBody?: unknown,
  ): Pick<AuthenticatedUser, 'id' | 'email' | 'name'> | undefined {
    if (actor) return actor;

    const normalized = path.split('?')[0]?.replace(/^\/api\/v1/, '') ?? path;
    if (normalized === '/auth/login' && responseBody && typeof responseBody === 'object') {
      const user = (responseBody as { user?: { id: string; email: string; name: string } }).user;
      if (user?.id) return user;
    }

    if (normalized === '/auth/login' && requestBody && typeof requestBody === 'object') {
      const email = (requestBody as { email?: unknown }).email;
      if (typeof email === 'string' && email.trim()) {
        return { id: '', email: email.toLowerCase(), name: email.toLowerCase() };
      }
    }

    return undefined;
  }
}
