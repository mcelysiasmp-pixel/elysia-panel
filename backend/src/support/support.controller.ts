import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { SupportService } from './support.service';

@Controller('support/tickets')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get()
  @RequirePermissions('support.create')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.support.listForUser(user);
  }

  @Get(':id')
  @RequirePermissions('support.create')
  get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.support.findAccessibleOrThrow(id, user);
  }

  @Post()
  @RequirePermissions('support.create')
  create(@Body('subject') subject: string, @Body('message') message: string, @CurrentUser() user: AuthenticatedUser) {
    return this.support.create(subject, message, user.id);
  }

  @Post(':id/reply')
  @RequirePermissions('support.create')
  reply(@Param('id') id: string, @Body('body') body: string, @CurrentUser() user: AuthenticatedUser) {
    const isStaff = user.permissions.includes('*') || user.permissions.includes('support.reply');
    return this.support.reply(id, body, user.id, isStaff);
  }

  @Post(':id/status')
  @RequirePermissions('support.reply')
  setStatus(@Param('id') id: string, @Body('status') status: 'OPEN' | 'PENDING' | 'RESOLVED' | 'CLOSED') {
    return this.support.setStatus(id, status);
  }
}
