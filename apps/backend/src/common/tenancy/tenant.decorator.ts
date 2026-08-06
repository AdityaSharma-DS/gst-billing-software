import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Injects the current tenant id — from TenantMiddleware (x-tenant-id header),
 *  falling back to the verified JWT claim (browser-opened links send no headers). */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const req = ctx.switchToHttp().getRequest();
    return req.tenantId ?? req.user?.tenantId;
  },
);
