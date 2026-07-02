import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { FilesService } from './files.service';

@Controller('servers/:serverId/files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Get()
  @RequirePermissions('files.read')
  list(@Param('serverId') serverId: string, @Query('path') path: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.files.list(serverId, path ?? '', user);
  }

  @Get('content')
  @RequirePermissions('files.read')
  async read(
    @Param('serverId') serverId: string,
    @Query('path') path: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const content = await this.files.read(serverId, path, user);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(content);
  }

  @Post()
  @RequirePermissions('files.write')
  write(
    @Param('serverId') serverId: string,
    @Body('path') path: string,
    @Body('content') content: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.files.write(serverId, path, Buffer.from(content ?? '', 'utf-8'), user);
  }

  @Post('delete')
  @RequirePermissions('files.write')
  delete(@Param('serverId') serverId: string, @Body('path') path: string, @CurrentUser() user: AuthenticatedUser) {
    return this.files.delete(serverId, path, user);
  }

  @Post('rename')
  @RequirePermissions('files.write')
  rename(
    @Param('serverId') serverId: string,
    @Body('fromPath') fromPath: string,
    @Body('toPath') toPath: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.files.rename(serverId, fromPath, toPath, user);
  }
}
