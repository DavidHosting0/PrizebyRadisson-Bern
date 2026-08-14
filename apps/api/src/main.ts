import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  const allowedOrigins = process.env.WEB_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean) ?? [];
  app.enableCors({
    origin: (origin, cb) => {
      // Server-to-server / curl / mobile webview (no Origin header).
      if (!origin) return cb(null, true);
      // Configured web origins (e.g. https://prizebern.com).
      if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return cb(null, true);
      }
      // Browser extensions (legacy / tooling) — JWT still required for app APIs.
      if (origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://') || origin.startsWith('safari-web-extension://')) {
        return cb(null, true);
      }
      // Deny without throwing — `cb(Error)` becomes a logged HTTP 500 for every
      // stray browser / extension probe (Google, ImmoScout, …).
      return cb(null, false);
    },
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`API listening on http://localhost:${port}/api/v1`);
}

bootstrap();
