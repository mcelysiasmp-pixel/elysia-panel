import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { RolesService } from './roles.service';

@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermissions('roles.read')
  list() {
    return this.roles.list();
  }

  @Get('permissions')
  @RequirePermissions('roles.read')
  listPermissions() {
    return this.roles.listPermissions();
  }

  @Post()
  @RequirePermissions('roles.create')
  create(
    @Body('name') name: string,
    @Body('description') description: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.roles.create(name, description, actor.id);
  }

  @Put(':id/permissions')
  @RequirePermissions('roles.update')
  setPermissions(
    @Param('id') id: string,
    @Body('permissions') permissions: string[],
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.roles.setPermissions(id, permissions, actor.id);
  }

  @Delete(':id')
  @RequirePermissions('roles.delete')
  delete(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.roles.delete(id, actor.id);
  }
}
