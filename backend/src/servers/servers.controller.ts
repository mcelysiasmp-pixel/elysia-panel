import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ServersService } from './servers.service';
import { CreateServerDto } from './dto/create-server.dto';

@Controller('servers')
export class ServersController {
  constructor(private readonly servers: ServersService) {}

  @Get()
  @RequirePermissions('servers.read')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.servers.listForUser(user);
  }

  @Get(':id')
  @RequirePermissions('servers.read')
  get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.servers.findAccessibleOrThrow(id, user);
  }

  @Post()
  @RequirePermissions('servers.create')
  create(@Body() dto: CreateServerDto, @CurrentUser() user: AuthenticatedUser) {
    return this.servers.create(dto, user);
  }

  @Post(':id/power/start')
  @RequirePermissions('servers.power')
  start(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.servers.powerAction(id, 'start', user);
  }

  @Post(':id/power/stop')
  @RequirePermissions('servers.power')
  stop(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.servers.powerAction(id, 'stop', user);
  }

  @Post(':id/power/restart')
  @RequirePermissions('servers.power')
  restart(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.servers.powerAction(id, 'restart', user);
  }

  @Post(':id/power/kill')
  @RequirePermissions('servers.power')
  kill(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.servers.powerAction(id, 'kill', user);
  }

  @Post(':id/command')
  @RequirePermissions('servers.console')
  sendCommand(@Param('id') id: string, @Body('command') command: string, @CurrentUser() user: AuthenticatedUser) {
    return this.servers.sendCommand(id, command, user);
  }

  @Post(':id/suspend')
  @RequirePermissions('servers.suspend')
  suspend(@Param('id') id: string, @Body('reason') reason: string, @CurrentUser() user: AuthenticatedUser) {
    return this.servers.suspend(id, reason, user.id);
  }

  @Post(':id/unsuspend')
  @RequirePermissions('servers.suspend')
  unsuspend(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.servers.unsuspend(id, user.id);
  }

  @Delete(':id')
  @RequirePermissions('servers.delete')
  delete(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.servers.delete(id, user);
  }

  @Post(':id/subusers')
  @RequirePermissions('servers.subusers')
  addSubUser(
    @Param('id') id: string,
    @Body('userId') userId: string,
    @Body('permissions') permissions: string[],
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.servers.addSubUser(id, userId, permissions, user);
  }

  @Delete(':id/subusers/:userId')
  @RequirePermissions('servers.subusers')
  removeSubUser(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.servers.removeSubUser(id, userId, user);
  }
}
