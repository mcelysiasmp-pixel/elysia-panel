import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-discord';
import { AuthService } from '../auth.service';

@Injectable()
export class DiscordStrategy extends PassportStrategy(Strategy, 'discord') {
  constructor(
    config: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: config.get<string>('oauth.discord.clientId') ?? 'unset',
      clientSecret: config.get<string>('oauth.discord.clientSecret') ?? 'unset',
      callbackURL: config.get<string>('oauth.discord.callbackUrl') ?? 'unset',
      scope: ['identify', 'email'],
    });
  }

  async validate(_accessToken: string, _refreshToken: string, profile: any) {
    return this.authService.validateOAuthLogin({
      provider: 'discord',
      providerId: profile.id,
      email: profile.email,
      username: profile.username,
    });
  }
}
