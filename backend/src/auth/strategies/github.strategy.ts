import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';
import { AuthService } from '../auth.service';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(
    config: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: config.get<string>('oauth.github.clientId') || 'unset',
      clientSecret: config.get<string>('oauth.github.clientSecret') || 'unset',
      callbackURL: config.get<string>('oauth.github.callbackUrl') || 'unset',
      scope: ['user:email'],
    });
  }

  async validate(_accessToken: string, _refreshToken: string, profile: any) {
    return this.authService.validateOAuthLogin({
      provider: 'github',
      providerId: profile.id,
      email:
        profile.emails?.[0]?.value ??
        `${profile.username}@users.noreply.github.com`,
      username: profile.username,
    });
  }
}
