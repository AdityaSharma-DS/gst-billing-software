import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentTenant } from '../../common/tenancy/tenant.decorator';
import { CurrentUser } from '../../common/auth/user.decorator';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Roles('ADMIN')
  list(@CurrentTenant() tenantId: string) {
    return this.users.list(tenantId);
  }

  @Post()
  @Roles('ADMIN')
  create(@CurrentTenant() tenantId: string, @CurrentUser() user: any, @Body() body: any) {
    return this.users.create(tenantId, body, user?.id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(@CurrentTenant() tenantId: string, @CurrentUser() user: any, @Param('id') id: string, @Body() body: any) {
    return this.users.update(tenantId, id, body, user?.id);
  }
}
