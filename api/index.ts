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

let cachedServer: express.Express | null = null;

async function bootstrap(): Promise<express.Express> {
  if (cachedServer) return cachedServer;

  // Required lazily (not at module top-level) so a missing/unbundled compiled
  // backend surfaces through the handler's try/catch instead of failing the
  // whole module import as an opaque FUNCTION_INVOCATION_FAILED.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { AppModule } = require('../apps/backend/dist/app.module');

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
  // DB-free liveness probe: proves the serverless function itself loads and runs
  // without touching NestJS or the database. Lets us tell "function is broken"
  // apart from "NestJS/DB bootstrap failed".
  if ((req.url || '').includes('/health')) {
    res.status(200).json({
      ok: true,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'unknown',
      hasAppDbUrl: !!process.env.APP_DATABASE_URL,
      hasDbUrl: !!process.env.DATABASE_URL,
      hasJwt: !!process.env.JWT_SECRET,
    });
    return;
  }
  try {
    const server = await bootstrap();
    return server(req, res);
  } catch (err: any) {
    // Without this, a bootstrap failure surfaces only as Vercel's opaque
    // FUNCTION_INVOCATION_FAILED. Log the full stack (visible in Vercel logs)
    // and return the error name/message so the cause is diagnosable.
    // eslint-disable-next-line no-console
    console.error('[api] bootstrap failed:', err);
    res.status(500).json({
      error: 'bootstrap_failed',
      name: err?.name ?? 'Error',
      message: err?.message ?? String(err),
    });
  }
}
