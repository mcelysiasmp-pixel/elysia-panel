import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ModrinthService } from './modrinth.service';
import { CurseforgeService } from './curseforge.service';
import { ModsService } from './mods.service';

@Controller()
export class ModsController {
  constructor(
    private readonly modrinth: ModrinthService,
    private readonly curseforge: CurseforgeService,
    private readonly mods: ModsService,
  ) {}

  // --- Catalogues (étapes 8 & 9) ---------------------------------------

  @Get('mods/modrinth/search')
  searchModrinth(
    @Query('query') query?: string,
    @Query('facets') facets?: string,
    @Query('limit') limit?: string,
  ) {
    return this.modrinth.search({
      query,
      facets,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('mods/modrinth/:projectId/versions')
  modrinthVersions(
    @Param('projectId') projectId: string,
    @Query('loader') loader?: string,
    @Query('gameVersion') gameVersion?: string,
  ) {
    return this.modrinth.getVersions(projectId, {
      loaders: loader ? [loader] : undefined,
      gameVersions: gameVersion ? [gameVersion] : undefined,
    });
  }

  @Get('mods/curseforge/search')
  searchCurseforge(
    @Query('searchFilter') searchFilter?: string,
    @Query('gameVersion') gameVersion?: string,
    @Query('classId') classId?: string,
  ) {
    return this.curseforge.search({
      searchFilter,
      gameVersion,
      classId: classId ? parseInt(classId, 10) : undefined,
    });
  }

  @Get('mods/curseforge/:modId/files')
  curseforgeFiles(@Param('modId') modId: string) {
    return this.curseforge.getFiles(parseInt(modId, 10));
  }

  // --- Mods installés sur un serveur (étape 10 : self-service) ---------

  @Get('servers/:serverId/mods')
  @RequirePermissions('mods.install')
  listInstalled(@Param('serverId') serverId: string) {
    return this.mods.listInstalled(serverId);
  }

  @Post('servers/:serverId/mods/modrinth')
  @RequirePermissions('mods.install')
  installModrinth(
    @Param('serverId') serverId: string,
    @Body('versionId') versionId: string,
    @Body('targetDir') targetDir: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mods.installFromModrinth(
      serverId,
      versionId,
      targetDir ?? 'mods',
      user,
    );
  }

  @Post('servers/:serverId/mods/curseforge')
  @RequirePermissions('mods.install')
  installCurseforge(
    @Param('serverId') serverId: string,
    @Body('modId') modId: number,
    @Body('fileId') fileId: number,
    @Body('targetDir') targetDir: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mods.installFromCurseforge(
      serverId,
      modId,
      fileId,
      targetDir ?? 'mods',
      user,
    );
  }

  @Post('servers/:serverId/mods/marketplace')
  @RequirePermissions('mods.install')
  installMarketplace(
    @Param('serverId') serverId: string,
    @Body('slug') slug: string,
    @Body('targetDir') targetDir: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mods.installFromMarketplace(
      serverId,
      slug,
      targetDir ?? 'plugins',
      user,
    );
  }

  @Delete('servers/:serverId/mods/:installedModId')
  @RequirePermissions('mods.remove')
  uninstall(
    @Param('serverId') serverId: string,
    @Param('installedModId') installedModId: string,
    @Query('targetDir') targetDir: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mods.uninstall(
      serverId,
      installedModId,
      targetDir ?? 'mods',
      user,
    );
  }

  // --- Modpacks en un clic (étape 10) -----------------------------------

  @Post('servers/:serverId/modpacks/modrinth')
  @RequirePermissions('mods.install')
  installModrinthPack(
    @Param('serverId') serverId: string,
    @Body('mrpackUrl') mrpackUrl: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mods.installModrinthModpack(serverId, mrpackUrl, user);
  }

  // Support FTB / Technic / ATLauncher / Prism-MultiMC : ces launchers
  // exportent (ou peuvent exporter) une archive compatible avec le manifest
  // CurseForge (manifest.json + overrides/), uploadée directement ici.
  @Post('servers/:serverId/modpacks/curseforge')
  @RequirePermissions('mods.install')
  @UseInterceptors(
    FileInterceptor('archive', { limits: { fileSize: 500 * 1024 * 1024 } }),
  )
  installCurseforgePack(
    @Param('serverId') serverId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mods.installCurseforgeModpack(serverId, file.buffer, user);
  }
}
