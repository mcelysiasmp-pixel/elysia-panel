import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-google-oauth20';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    config: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: config.get<string>('oauth.google.clientId') ?? 'unset',
      clientSecret: config.get<string>('oauth.google.clientSecret') ?? 'unset',
      callbackURL: config.get<string>('oauth.google.callbackUrl') ?? 'unset',
      scope: ['profile', 'email'],
    });
  }

  async validate(_accessToken: string, _refreshToken: string, profile: any) {
    return this.authService.validateOAuthLogin({
      provider: 'google',
      providerId: profile.id,
      email: profile.emails?.[0]?.value,
      username: profile.displayName?.replace(/\s+/g, '_') ?? profile.id,
    });
  }
}
