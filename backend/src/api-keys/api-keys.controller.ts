import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ApiKeysService } from './api-keys.service';

@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.apiKeys.list(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body('name') name: string,
    @Body('scopes') scopes: string[],
    @Body('expiresAt') expiresAt: string | undefined,
  ) {
    return this.apiKeys.create(
      user,
      name,
      scopes ?? [],
      expiresAt ? new Date(expiresAt) : undefined,
    );
  }

  @Delete(':id')
  revoke(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.apiKeys.revoke(id, user);
  }
}
