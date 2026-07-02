import { Injectable } from '@nestjs/common';
import { ServersService } from '../servers/servers.service';
import { NodeClientService } from '../grpc-client/node-client.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';

export interface FileEntryDto {
  name: string;
  is_directory: boolean;
  size_bytes: string;
  modified_at_ms: string;
  mode: string;
}

@Injectable()
export class FilesService {
  constructor(
    private readonly servers: ServersService,
    private readonly nodeClient: NodeClientService,
    private readonly audit: AuditService,
  ) {}

  private async connFor(serverId: string, user: AuthenticatedUser) {
    const server = await this.servers.findAccessibleOrThrow(serverId, user);
    return { server, params: { host: server.node.grpcHost, port: server.node.grpcPort } };
  }

  async list(serverId: string, path: string, user: AuthenticatedUser) {
    const { server, params } = await this.connFor(serverId, user);
    const res = await this.nodeClient.call<any, { entries: FileEntryDto[] }>(server.nodeId, params, 'ListFiles', {
      server_uuid: server.uuid,
      path,
    });
    return res.entries ?? [];
  }

  async read(serverId: string, path: string, user: AuthenticatedUser) {
    const { server, params } = await this.connFor(serverId, user);
    const res = await this.nodeClient.call<any, { content: Buffer }>(server.nodeId, params, 'ReadFile', {
      server_uuid: server.uuid,
      path,
    });
    return res.content;
  }

  async write(serverId: string, path: string, content: Buffer, user: AuthenticatedUser) {
    const { server, params } = await this.connFor(serverId, user);
    await this.nodeClient.call(server.nodeId, params, 'WriteFile', { server_uuid: server.uuid, path, content });
    await this.audit.log({ actorId: user.id, action: 'file.write', targetType: 'Server', targetId: serverId, metadata: { path } });
  }

  async delete(serverId: string, path: string, user: AuthenticatedUser) {
    const { server, params } = await this.connFor(serverId, user);
    await this.nodeClient.call(server.nodeId, params, 'DeleteFile', { server_uuid: server.uuid, path });
    await this.audit.log({ actorId: user.id, action: 'file.delete', targetType: 'Server', targetId: serverId, metadata: { path } });
  }

  async rename(serverId: string, fromPath: string, toPath: string, user: AuthenticatedUser) {
    const { server, params } = await this.connFor(serverId, user);
    await this.nodeClient.call(server.nodeId, params, 'RenameFile', {
      server_uuid: server.uuid,
      from_path: fromPath,
      to_path: toPath,
    });
  }

  async mkdir(serverId: string, path: string, user: AuthenticatedUser) {
    const { server, params } = await this.connFor(serverId, user);
    await this.nodeClient.call(server.nodeId, params, 'CreateDirectory', { server_uuid: server.uuid, path });
    await this.audit.log({ actorId: user.id, action: 'file.mkdir', targetType: 'Server', targetId: serverId, metadata: { path } });
  }
}
