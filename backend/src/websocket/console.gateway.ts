import { Logger, UnauthorizedException } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { ServersService } from '../servers/servers.service';
import { NodeClientService } from '../grpc-client/node-client.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';

interface AuthedSocket extends Socket {
  data: {
    user?: AuthenticatedUser;
    cancelStreams?: Map<string, () => void>;
  };
}

// Namespace unique regroupant console, stats et notifications temps réel.
// Auth via le même access token JWT que l'API REST (handshake.auth.token).
@WebSocketGateway({ namespace: '/ws', cors: { origin: '*' } })
export class ConsoleGateway implements OnGatewayInit, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ConsoleGateway.name);

  constructor(
    private readonly authService: AuthService,
    private readonly serversService: ServersService,
    private readonly nodeClient: NodeClientService,
  ) {}

  // Auth en middleware de namespace plutôt que dans handleConnection : ce
  // dernier est asynchrone (résolution JWT + lookup Prisma) mais NestJS
  // n'attend pas sa complétion avant de dispatcher les messages entrants —
  // un client qui émet un événement juste après 'connect' pouvait donc
  // atteindre @SubscribeMessage avant que socket.data.user soit renseigné
  // (`Cannot read properties of undefined (reading 'permissions')`, crash
  // systématique de stats:subscribe car son ack aller-retour est plus
  // rapide que console:subscribe à être testé manuellement). Un middleware
  // `server.use()` fait partie du handshake : socket.io garantit qu'il est
  // résolu avant que 'connection' ne soit émis et donc avant tout message.
  afterInit(server: Server) {
    server.use(async (socket: AuthedSocket, next) => {
      try {
        const token = socket.handshake.auth?.token ?? socket.handshake.query?.token;
        if (typeof token !== 'string') throw new UnauthorizedException('Token manquant');
        socket.data.user = await this.authService.resolveUserFromAccessToken(token);
        socket.data.cancelStreams = new Map();
        next();
      } catch (err) {
        this.logger.warn(`Connexion WS rejetée: ${(err as Error).message}`);
        next(err as Error);
      }
    });
  }

  handleDisconnect(socket: AuthedSocket) {
    socket.data.cancelStreams?.forEach((cancel) => cancel());
    socket.data.cancelStreams?.clear();
  }

  @SubscribeMessage('console:subscribe')
  async subscribeConsole(@ConnectedSocket() socket: AuthedSocket, @MessageBody() data: { serverId: string }) {
    const user = socket.data.user!;
    const server = await this.serversService.findAccessibleOrThrow(data.serverId, user);

    socket.data.cancelStreams?.get(`console:${server.id}`)?.();

    const cancel = this.nodeClient.streamCall(
      server.nodeId,
      { host: server.node.grpcHost, port: server.node.grpcPort },
      'StreamConsole',
      { server_uuid: server.uuid },
      {
        onData: (chunk: any) => socket.emit('console:line', { serverId: server.id, ...chunk }),
        onError: (err) => socket.emit('console:error', { serverId: server.id, message: err.message }),
        onEnd: () => socket.emit('console:closed', { serverId: server.id }),
      },
    );
    socket.data.cancelStreams?.set(`console:${server.id}`, cancel);
    return { subscribed: true };
  }

  @SubscribeMessage('console:unsubscribe')
  unsubscribeConsole(@ConnectedSocket() socket: AuthedSocket, @MessageBody() data: { serverId: string }) {
    socket.data.cancelStreams?.get(`console:${data.serverId}`)?.();
    socket.data.cancelStreams?.delete(`console:${data.serverId}`);
    return { unsubscribed: true };
  }

  @SubscribeMessage('console:send')
  async sendCommand(@ConnectedSocket() socket: AuthedSocket, @MessageBody() data: { serverId: string; command: string }) {
    const user = socket.data.user!;
    return this.serversService.sendCommand(data.serverId, data.command, user);
  }

  @SubscribeMessage('stats:subscribe')
  async subscribeStats(@ConnectedSocket() socket: AuthedSocket, @MessageBody() data: { serverId: string }) {
    const user = socket.data.user!;
    const server = await this.serversService.findAccessibleOrThrow(data.serverId, user);

    socket.data.cancelStreams?.get(`stats:${server.id}`)?.();

    const cancel = this.nodeClient.streamCall(
      server.nodeId,
      { host: server.node.grpcHost, port: server.node.grpcPort },
      'StreamStats',
      { server_uuid: server.uuid },
      {
        onData: (chunk: any) => socket.emit('stats:update', { serverId: server.id, ...chunk }),
        onError: (err) => socket.emit('stats:error', { serverId: server.id, message: err.message }),
      },
    );
    socket.data.cancelStreams?.set(`stats:${server.id}`, cancel);
    return { subscribed: true };
  }

  @SubscribeMessage('stats:unsubscribe')
  unsubscribeStats(@ConnectedSocket() socket: AuthedSocket, @MessageBody() data: { serverId: string }) {
    socket.data.cancelStreams?.get(`stats:${data.serverId}`)?.();
    socket.data.cancelStreams?.delete(`stats:${data.serverId}`);
    return { unsubscribed: true };
  }
}
