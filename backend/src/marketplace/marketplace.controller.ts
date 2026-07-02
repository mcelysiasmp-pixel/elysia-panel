import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { MarketplaceService } from './marketplace.service';

@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly marketplace: MarketplaceService) {}

  @Public()
  @Get('items')
  list(@Query('type') type?: string) {
    return this.marketplace.list(type);
  }

  @Public()
  @Get('items/:slug')
  get(@Param('slug') slug: string) {
    return this.marketplace.get(slug);
  }

  @Post('items/:slug/download')
  @RequirePermissions('marketplace.read')
  download(@Param('slug') slug: string) {
    return this.marketplace.incrementDownloads(slug);
  }

  @Post('items')
  @RequirePermissions('marketplace.publish')
  publish(@Body() body: any, @CurrentUser() actor: AuthenticatedUser) {
    return this.marketplace.publish(body, actor.id);
  }

  @Post('items/:id/verify')
  @RequirePermissions('marketplace.publish')
  verify(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.marketplace.verify(id, actor.id);
  }
}
