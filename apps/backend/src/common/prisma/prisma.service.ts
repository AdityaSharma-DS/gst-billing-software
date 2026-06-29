import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Run a callback with the tenant RLS context set for the connection.
   * Uses a transaction so the SET LOCAL is scoped to these queries.
   */
  async withTenant<T>(tenantId: string, fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${tenantId}'`);
      return fn(tx as unknown as PrismaClient);
    });
  }
}
