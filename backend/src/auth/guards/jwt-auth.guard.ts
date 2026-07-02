import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { ApiKeysService } from '../../api-keys/api-keys.service';

const API_KEY_PREFIX = 'elysia_';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    private readonly apiKeys: ApiKeysService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();

    // Endpoint de scrape Prometheus (@willsoto/nestjs-prometheus n'expose
    // pas de moyen d'y attacher le décorateur @Public()). À restreindre au
    // réseau interne via le reverse-proxy / firewall en production.
    if (request?.url?.endsWith('/metrics')) return true;

    // Documentation Swagger (/api/docs) : à restreindre également côté
    // reverse-proxy en production si elle ne doit pas être publique.
    if (request?.url?.startsWith('/api/docs')) return true;

    // Même en-tête Authorization: Bearer que le JWT, distingué par le
    // préfixe fixe des clés API (voir ApiKeysService) — évite d'exiger un
    // deuxième schéma/en-tête côté clients scriptés.
    const authHeader: string | undefined = request?.headers?.authorization;
    const bearerToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : undefined;
    if (bearerToken?.startsWith(API_KEY_PREFIX)) {
      request.user = await this.apiKeys.validateAndGetUser(bearerToken);
      return true;
    }

    return super.canActivate(context) as Promise<boolean>;
  }
}
