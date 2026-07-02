import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { NodesService } from './nodes.service';
import { CreateNodeDto } from './dto/create-node.dto';

@Controller('nodes')
export class NodesController {
  constructor(private readonly nodes: NodesService) {}

  @Get()
  @RequirePermissions('nodes.read')
  list() {
    return this.nodes.list();
  }

  @Get(':id')
  @RequirePermissions('nodes.read')
  get(@Param('id') id: string) {
    return this.nodes.findByIdOrThrow(id);
  }

  @Get(':id/health')
  @RequirePermissions('nodes.read')
  health(@Param('id') id: string) {
    return this.nodes.healthCheck(id);
  }

  @Post()
  @RequirePermissions('nodes.create')
  create(@Body() dto: CreateNodeDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.nodes.create(dto, actor.id);
  }

  @Post(':id/maintenance/enable')
  @RequirePermissions('nodes.maintenance')
  enableMaintenance(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.nodes.setMaintenance(id, true, actor.id);
  }

  @Post(':id/maintenance/disable')
  @RequirePermissions('nodes.maintenance')
  disableMaintenance(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.nodes.setMaintenance(id, false, actor.id);
  }

  @Delete(':id')
  @RequirePermissions('nodes.delete')
  delete(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.nodes.delete(id, actor.id);
  }
}
