import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Extracts the tenant id from the request (JWT claim or `x-tenant-id` header)
 * and attaches it to the request so services can scope queries via
 * PrismaService.withTenant(tenantId, ...). This is what drives RLS.
 *
 * In production the tenant id should come from the verified JWT, not a header.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request & { tenantId?: string }, _res: Response, next: NextFunction) {
    const headerTenant = req.header('x-tenant-id');
    // TODO: prefer the tenantId claim from the verified JWT once auth is wired.
    req.tenantId = headerTenant || undefined;
    next();
  }
}
