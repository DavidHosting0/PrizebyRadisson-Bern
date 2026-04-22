import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

/**
 * Global exception filter.
 *
 * Two goals:
 * 1) Always log the real error (with stack) on the server so 500s are debuggable.
 * 2) Translate well-known Prisma errors into actionable 4xx/5xx messages
 *    instead of the opaque "Internal server error".
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    // HttpException — pass through but still log for visibility.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (status >= 500) {
        this.log.error(`${req.method} ${req.url} -> ${status}`, (exception as Error).stack);
      }
      return res.status(status).json(typeof body === 'string' ? { statusCode: status, message: body } : body);
    }

    // Prisma known errors — often column/constraint issues from pending migrations.
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const { code, meta } = exception;
      this.log.error(
        `${req.method} ${req.url} -> Prisma ${code} ${JSON.stringify(meta)}`,
        exception.stack,
      );
      if (code === 'P2022') {
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          statusCode: 500,
          message:
            'Database schema is out of date. Run `npx prisma migrate deploy` from apps/api on the server.',
          code,
        });
      }
      if (code === 'P2002') {
        return res.status(HttpStatus.CONFLICT).json({
          statusCode: 409,
          message: 'This value already exists.',
          code,
        });
      }
      if (code === 'P2025') {
        return res.status(HttpStatus.NOT_FOUND).json({
          statusCode: 404,
          message: 'Record not found.',
          code,
        });
      }
      return res.status(HttpStatus.BAD_REQUEST).json({
        statusCode: 400,
        message: exception.message.split('\n').slice(-1)[0] ?? 'Database request failed',
        code,
      });
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      // Usually means: passing a field Prisma doesn't know — i.e. a pending migration
      // on the other side (client generated against a newer schema than the DB has).
      this.log.error(
        `${req.method} ${req.url} -> PrismaValidationError`,
        (exception as Error).stack,
      );
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: 500,
        message:
          'Database schema is out of date or the request shape is invalid. ' +
          'Run `npx prisma migrate deploy` from apps/api on the server.',
      });
    }

    // Anything else — log the stack so pm2 shows the real cause.
    const err = exception as Error;
    this.log.error(
      `${req.method} ${req.url} -> 500: ${err?.message ?? 'unknown'}`,
      err?.stack,
    );
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: 500,
      message: 'Internal server error',
    });
  }
}
