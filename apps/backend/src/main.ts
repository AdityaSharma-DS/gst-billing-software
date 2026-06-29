import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix(config.get('API_PREFIX', 'api'));
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  app.enableCors();

  const port = config.get<number>('PORT', 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`GST Billing API listening on http://localhost:${port}`);
}
bootstrap();
