import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import AdmZip = require('adm-zip');
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ServersService } from '../servers/servers.service';
import { NodeClientService } from '../grpc-client/node-client.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ModrinthService } from './modrinth.service';
import { CurseforgeService } from './curseforge.service';

interface ModrinthIndex {
  files: Array<{
    path: string;
    downloads: string[];
    env?: { server: 'required' | 'optional' | 'unsupported' };
  }>;
}

interface CurseforgeManifest {
  files: Array<{ projectID: number; fileID: number; required: boolean }>;
  overrides: string;
}

@Injectable()
export class ModsService {
  private readonly logger = new Logger(ModsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly servers: ServersService,
    private readonly nodeClient: NodeClientService,
    private readonly modrinth: ModrinthService,
    private readonly curseforge: CurseforgeService,
  ) {}

  // -------------------------------------------------------------------
  // Installation d'un mod/plugin individuel
  // -------------------------------------------------------------------

  async installFromModrinth(serverId: string, versionId: string, targetDir: string, user: AuthenticatedUser) {
    const server = await this.servers.findAccessibleOrThrow(serverId, user);
    const version = await this.modrinth.getVersion(versionId);
    const primaryFile = version.files.find((f) => f.primary) ?? version.files[0];
    if (!primaryFile) throw new BadRequestException('Aucun fichier disponible pour cette version Modrinth');

    const content = await this.modrinth.downloadFile(primaryFile.url);
    await this.writeToServer(server, `${targetDir}/${primaryFile.filename}`, content);

    const record = await this.prisma.installedMod.upsert({
      where: { serverId_projectId: { serverId, projectId: version.id.split('.')[0] || versionId } },
      update: { versionId: version.id, fileName: primaryFile.filename, name: version.name },
      create: {
        serverId,
        source: 'MODRINTH',
        projectId: versionId,
        versionId: version.id,
        fileName: primaryFile.filename,
        name: version.name,
        dependencies: version.dependencies as unknown as object,
      },
    });

    await this.audit.log({ actorId: user.id, action: 'mod.install', targetType: 'Server', targetId: serverId, metadata: { source: 'MODRINTH', versionId } });
    return record;
  }

  async installFromCurseforge(serverId: string, modId: number, fileId: number, targetDir: string, user: AuthenticatedUser) {
    const server = await this.servers.findAccessibleOrThrow(serverId, user);
    const file = await this.curseforge.getFile(modId, fileId);

    const content = await this.curseforge.downloadFile(file.downloadUrl);
    await this.writeToServer(server, `${targetDir}/${file.fileName}`, content);

    const record = await this.prisma.installedMod.upsert({
      where: { serverId_projectId: { serverId, projectId: String(modId) } },
      update: { versionId: String(fileId), fileName: file.fileName },
      create: {
        serverId,
        source: 'CURSEFORGE',
        projectId: String(modId),
        versionId: String(fileId),
        fileName: file.fileName,
        name: file.fileName,
      },
    });

    await this.audit.log({ actorId: user.id, action: 'mod.install', targetType: 'Server', targetId: serverId, metadata: { source: 'CURSEFORGE', modId, fileId } });
    return record;
  }

  async uninstall(serverId: string, installedModId: string, targetDir: string, user: AuthenticatedUser) {
    const server = await this.servers.findAccessibleOrThrow(serverId, user);
    const mod = await this.prisma.installedMod.findUniqueOrThrow({ where: { id: installedModId } });

    await this.nodeClient.call(server.nodeId, { host: server.node.grpcHost, port: server.node.grpcPort }, 'DeleteFile', {
      server_uuid: server.uuid,
      path: `${targetDir}/${mod.fileName}`,
    });

    await this.prisma.installedMod.delete({ where: { id: installedModId } });
    await this.audit.log({ actorId: user.id, action: 'mod.remove', targetType: 'Server', targetId: serverId });
  }

  listInstalled(serverId: string) {
    return this.prisma.installedMod.findMany({ where: { serverId }, orderBy: { installedAt: 'desc' } });
  }

  // -------------------------------------------------------------------
  // Modpacks — installation en un clic
  // -------------------------------------------------------------------

  // Format .mrpack (Modrinth) : zip contenant modrinth-index.json + overrides/
  async installModrinthModpack(serverId: string, mrpackUrl: string, user: AuthenticatedUser) {
    const server = await this.servers.findAccessibleOrThrow(serverId, user);
    const archive = await this.modrinth.downloadFile(mrpackUrl);
    const zip = new AdmZip(archive);

    const indexEntry = zip.getEntry('modrinth-index.json');
    if (!indexEntry) throw new BadRequestException('Fichier .mrpack invalide : modrinth-index.json manquant');
    const index: ModrinthIndex = JSON.parse(zip.readAsText(indexEntry));

    let installed = 0;
    for (const file of index.files) {
      if (file.env?.server === 'unsupported') continue;
      const url = file.downloads[0];
      if (!url) continue;
      const content = await this.modrinth.downloadFile(url);
      await this.writeToServer(server, file.path, content);
      installed++;
    }

    // Overrides (configs fournis par le modpack) : tout le contenu du
    // dossier overrides/ est copié tel quel à la racine du serveur.
    for (const entry of zip.getEntries()) {
      if (entry.entryName.startsWith('overrides/') && !entry.isDirectory) {
        const relPath = entry.entryName.replace(/^overrides\//, '');
        await this.writeToServer(server, relPath, entry.getData());
      }
    }

    await this.audit.log({
      actorId: user.id,
      action: 'modpack.install',
      targetType: 'Server',
      targetId: serverId,
      metadata: { source: 'MODRINTH_PACK', filesInstalled: installed },
    });
    return { installed };
  }

  // Format CurseForge (également utilisé, avec des variations mineures, par
  // les exports FTB / ATLauncher / Technic / Prism-MultiMC) : zip contenant
  // manifest.json {files:[{projectID,fileID}]} + overrides/.
  async installCurseforgeModpack(serverId: string, archiveBuffer: Buffer, user: AuthenticatedUser) {
    const server = await this.servers.findAccessibleOrThrow(serverId, user);
    const zip = new AdmZip(archiveBuffer);

    const manifestEntry = zip.getEntry('manifest.json');
    if (!manifestEntry) throw new BadRequestException('Archive invalide : manifest.json manquant');
    const manifest: CurseforgeManifest = JSON.parse(zip.readAsText(manifestEntry));

    let installed = 0;
    for (const file of manifest.files) {
      try {
        const cfFile = await this.curseforge.getFile(file.projectID, file.fileID);
        const content = await this.curseforge.downloadFile(cfFile.downloadUrl);
        await this.writeToServer(server, `mods/${cfFile.fileName}`, content);
        installed++;
      } catch (err) {
        this.logger.warn(`Échec téléchargement mod CurseForge ${file.projectID}/${file.fileID}: ${(err as Error).message}`);
      }
    }

    const overridesDir = manifest.overrides || 'overrides';
    for (const entry of zip.getEntries()) {
      if (entry.entryName.startsWith(`${overridesDir}/`) && !entry.isDirectory) {
        const relPath = entry.entryName.replace(new RegExp(`^${overridesDir}/`), '');
        await this.writeToServer(server, relPath, entry.getData());
      }
    }

    await this.audit.log({
      actorId: user.id,
      action: 'modpack.install',
      targetType: 'Server',
      targetId: serverId,
      metadata: { source: 'CURSEFORGE_PACK', filesInstalled: installed },
    });
    return { installed };
  }

  private async writeToServer(server: { uuid: string; nodeId: string; node: { grpcHost: string; grpcPort: number } }, path: string, content: Buffer) {
    await this.nodeClient.call(server.nodeId, { host: server.node.grpcHost, port: server.node.grpcPort }, 'WriteFile', {
      server_uuid: server.uuid,
      path,
      content,
    });
  }
}
