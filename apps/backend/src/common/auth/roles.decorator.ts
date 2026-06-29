import { SetMetadata } from '@nestjs/common';

export type Role = 'ADMIN' | 'ACCOUNTANT' | 'VIEWER';
export const ROLES_KEY = 'roles';

/** Restrict a route to one or more roles. Usage: @Roles('ADMIN', 'ACCOUNTANT') */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
