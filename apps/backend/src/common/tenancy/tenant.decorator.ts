import { createParamDecorator, ExecutionContext, ForbiddenException } from '@nestjs/common';

/**
 * Injects the current tenant id - ALWAYS from the verified JWT claim.
 *
 * It used to read the `x-tenant-id` request header first and fall back to the
 * JWT. That let any authenticated user read another tenant's data simply by
 * sending someone else's tenant id in a header: `withTenant()` would then set
 * `app.current_tenant` to the attacker-supplied value and RLS would happily
 * return the victim's rows. The header is attacker-controlled and must never
 * be authoritative.
 *
 * Every controller using this decorator sits behind JwtAuthGuard, so req.user
 * is always populated. A header that disagrees with the token is treated as an
 * attempted tenant switch and rejected outright.
 */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const req = ctx.switchToHttp().getRequest();
    const tenantId: string | undefined = req.user?.tenantId;
    const headerTenant = req.header?.('x-tenant-id') || req.headers?.['x-tenant-id'];

    if (tenantId && headerTenant && headerTenant !== tenantId) {
      throw new ForbiddenException('Tenant mismatch');
    }
    return tenantId;
  },
);
