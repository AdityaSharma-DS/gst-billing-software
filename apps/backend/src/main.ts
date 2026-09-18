import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import * as express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { corsOptions } from './common/security/cors';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Trust the proxy so client IPs (rate limiting) are read from X-Forwarded-For.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use(helmet());
  app.setGlobalPrefix(config.get('API_PREFIX', 'api'));
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  app.enableCors(corsOptions());

  // Serve locally-stored tenant documents (e.g. logos) read-only.
  app.use('/uploads', express.static(join(process.cwd(), 'storage')));

  const port = config.get<number>('PORT', 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`GST Billing API listening on http://localhost:${port}`);
}
bootstrap();
