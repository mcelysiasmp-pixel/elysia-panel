import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import * as fs from 'fs';

// Chemin du contrat gRPC partagé avec Elysia Node (voir api/openapi/elysia.proto).
// Résolu depuis process.cwd() plutôt que __dirname : ce dernier pointe vers
// backend/dist/src/grpc-client une fois compilé (profondeur différente de
// backend/src/grpc-client en ts-node), ce qui cassait la résolution du
// chemin aussi bien en dev (nest start --watch tourne déjà sur le JS
// compilé) qu'en prod. cwd est toujours la racine de backend/ (voir
// package.json "start:dev"/"start:prod" et le WorkingDirectory du service
// systemd) ; l'installateur déploie api/ en frère de backend/ pour que ce
// chemin relatif reste valide (voir installer/install.sh build_backend()).
const PROTO_PATH = path.resolve(process.cwd(), '../api/openapi/elysia.proto');

interface NodeConnectionParams {
  host: string;
  port: number;
  caCertPath?: string;
  clientCertPath?: string;
  clientKeyPath?: string;
}

// Enveloppe fine autour d'un client gRPC NodeService. Une instance de
// NodeClientService = une connexion à un Elysia Node donné. Le NodesService
// (module `nodes`) maintient un cache d'instances par nodeId.
@Injectable()
export class NodeClientService implements OnModuleDestroy {
  private readonly logger = new Logger(NodeClientService.name);
  private readonly clients = new Map<string, grpc.Client>();
  private packageDef: protoLoader.PackageDefinition | undefined;

  private loadProto() {
    if (!this.packageDef) {
      if (!fs.existsSync(PROTO_PATH)) {
        throw new Error(`Fichier proto introuvable: ${PROTO_PATH}`);
      }
      this.packageDef = protoLoader.loadSync(PROTO_PATH, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      });
    }
    return this.packageDef;
  }

  private getOrCreateClient(nodeId: string, params: NodeConnectionParams): grpc.Client {
    const cached = this.clients.get(nodeId);
    if (cached) return cached;

    const packageDef = this.loadProto();
    const proto = grpc.loadPackageDefinition(packageDef) as any;
    const NodeServiceCtor = proto.elysia.node.v1.NodeService;

    const credentials =
      params.caCertPath && params.clientCertPath && params.clientKeyPath
        ? grpc.credentials.createSsl(
            fs.readFileSync(params.caCertPath),
            fs.readFileSync(params.clientKeyPath),
            fs.readFileSync(params.clientCertPath),
          )
        : grpc.credentials.createInsecure(); // dev uniquement — mTLS obligatoire en prod (voir installer/)

    const client: grpc.Client = new NodeServiceCtor(`${params.host}:${params.port}`, credentials);
    this.clients.set(nodeId, client);
    return client;
  }

  async ping(nodeId: string, params: NodeConnectionParams): Promise<{ nonce: string; nodeVersion: string }> {
    const client = this.getOrCreateClient(nodeId, params) as any;
    return new Promise((resolve, reject) => {
      client.Ping({ nonce: Date.now().toString() }, (err: grpc.ServiceError | null, res: any) => {
        if (err) return reject(err);
        resolve({ nonce: res.nonce, nodeVersion: res.node_version });
      });
    });
  }

  async call<TReq extends object, TRes>(
    nodeId: string,
    params: NodeConnectionParams,
    method: string,
    request: TReq,
  ): Promise<TRes> {
    const client = this.getOrCreateClient(nodeId, params) as any;
    return new Promise((resolve, reject) => {
      if (typeof client[method] !== 'function') {
        return reject(new Error(`Méthode gRPC inconnue: ${method}`));
      }
      client[method](request, (err: grpc.ServiceError | null, res: TRes) => {
        if (err) {
          this.logger.error(`gRPC ${method} vers node ${nodeId} a échoué: ${err.message}`);
          return reject(err);
        }
        resolve(res);
      });
    });
  }

  // Appel gRPC server-streaming (StreamConsole, StreamStats, TransferOut/In).
  // Retourne une fonction d'annulation à appeler quand le client WS se déconnecte.
  streamCall<TReq extends object, TChunk>(
    nodeId: string,
    params: NodeConnectionParams,
    method: string,
    request: TReq,
    handlers: { onData: (chunk: TChunk) => void; onEnd?: () => void; onError?: (err: Error) => void },
  ): () => void {
    const client = this.getOrCreateClient(nodeId, params) as any;
    if (typeof client[method] !== 'function') {
      throw new Error(`Méthode gRPC streaming inconnue: ${method}`);
    }
    const call = client[method](request);
    call.on('data', (chunk: TChunk) => handlers.onData(chunk));
    call.on('end', () => handlers.onEnd?.());
    call.on('error', (err: Error) => handlers.onError?.(err));
    return () => call.cancel();
  }

  disconnect(nodeId: string) {
    const client = this.clients.get(nodeId);
    if (client) {
      client.close();
      this.clients.delete(nodeId);
    }
  }

  onModuleDestroy() {
    for (const client of this.clients.values()) client.close();
  }
}
