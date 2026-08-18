import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * The tenant id is derived from the verified JWT by the `CurrentTenant`
 * decorator - NOT from the `x-tenant-id` header, which is attacker-controlled.
 *
 * This middleware deliberately no longer populates `req.tenantId` from that
 * header. It is kept only so the header remains visible for request logging.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request & { untrustedTenantHeader?: string }, _res: Response, next: NextFunction) {
    req.untrustedTenantHeader = req.header('x-tenant-id') || undefined;
    next();
  }
}
