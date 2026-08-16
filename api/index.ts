/**
 * Vercel serverless entrypoint for the NestJS backend.
 *
 * The Nest app is compiled ahead of time by nest build (see the root
 * vercel-build script) and imported here from apps/backend/dist so
 * that decorator metadata is emitted correctly. The Express instance
 * is cached on module scope so warm invocations skip bootstrap.
 */
import 'reflect-metadata';
import express from 'express';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { Request, Response } from 'express';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AppModule } = require('../apps/backend/dist/app.module');

let cachedServer: express.Express | null = null;

async function bootstrap(): Promise<express.Express> {
  if (cachedServer) return cachedServer;

  const server = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    logger: ['error', 'warn'],
  });

  app.setGlobalPrefix(process.env.API_PREFIX || 'api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors();

  await app.init();
  cachedServer = server;
  return server;
}

export default async function handler(req: Request, res: Response) {
  const server = await bootstrap();
  return server(req, res);
}
