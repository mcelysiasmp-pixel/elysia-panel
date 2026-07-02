import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

// Protège les endpoints internes appelés par Elysia Node (daemon), jamais
// par le dashboard : le daemon envoie le secret partagé dans l'en-tête
// X-Node-Secret. Comparaison en temps constant pour éviter le timing attack.
@Injectable()
export class NodeSecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const provided: string | undefined = request.headers['x-node-secret'];
    const expected = this.config.get<string>('internal.nodeSecret') ?? '';

    if (!provided || !expected || !timingSafeEqual(provided, expected)) {
      throw new UnauthorizedException('Secret interne invalide');
    }
    return true;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
