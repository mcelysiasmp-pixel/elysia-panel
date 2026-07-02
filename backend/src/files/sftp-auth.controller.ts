import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { NodeSecretGuard } from '../common/guards/node-secret.guard';
import { SftpAuthService } from './sftp-auth.service';
import { SftpAuthDto } from './dto/sftp-auth.dto';

// Endpoint interne (jamais exposé au dashboard) : appelé par le daemon
// Elysia Node lors d'une tentative de connexion SFTP. @Public() pour
// échapper au JwtAuthGuard global (pas de JWT côté daemon, même schéma que
// le webhook Stripe) — protégé à la place par NodeSecretGuard (secret
// partagé, voir X-Node-Secret).
@Controller('internal/sftp')
@Public()
@UseGuards(NodeSecretGuard)
export class SftpAuthController {
  constructor(private readonly sftpAuth: SftpAuthService) {}

  @Post('auth')
  auth(@Body() dto: SftpAuthDto) {
    return this.sftpAuth.authenticate(dto.username, dto.password);
  }
}
