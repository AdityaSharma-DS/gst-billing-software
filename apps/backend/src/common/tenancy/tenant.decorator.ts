import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Injects the current tenant id resolved by TenantMiddleware. */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const req = ctx.switchToHttp().getRequest();
    return req.tenantId;
  },
);
