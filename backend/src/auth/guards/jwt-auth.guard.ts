import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Endpoint de scrape Prometheus (@willsoto/nestjs-prometheus n'expose
    // pas de moyen d'y attacher le décorateur @Public()). À restreindre au
    // réseau interne via le reverse-proxy / firewall en production.
    const request = context.switchToHttp().getRequest();
    if (request?.url?.endsWith('/metrics')) return true;

    // Documentation Swagger (/api/docs) : à restreindre également côté
    // reverse-proxy en production si elle ne doit pas être publique.
    if (request?.url?.startsWith('/api/docs')) return true;

    return super.canActivate(context);
  }
}
