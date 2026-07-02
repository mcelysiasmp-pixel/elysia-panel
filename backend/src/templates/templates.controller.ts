import { Body, Controller, Get, Post } from '@nestjs/common';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { TemplatesService } from './templates.service';

@Controller('server-templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  @RequirePermissions('servers.create')
  list() {
    return this.templates.list();
  }

  @Post()
  @RequirePermissions('nodes.create')
  create(@Body() body: Record<string, unknown>, @CurrentUser() actor: AuthenticatedUser) {
    return this.templates.create(body, actor.id);
  }
}
