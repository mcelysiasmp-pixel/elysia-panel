import {
  Body,
  Controller,
  Get,
  Ip,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import type { AuthenticatedUser } from './types/authenticated-user';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto, @Ip() ip: string) {
    return this.authService.register(dto, ip);
  }

  // Anti-bruteforce : 5 tentatives / minute / IP sur le login
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  async login(@Body() dto: LoginDto, @Ip() ip: string, @Req() req: Request) {
    const user = await this.authService.validateLocalUser(
      dto.email,
      dto.password,
    );
    if (!user) throw new UnauthorizedException('Identifiants invalides');
    return this.authService.login(
      user.id,
      dto.totpCode,
      ip,
      req.headers['user-agent'],
    );
  }

  @Public()
  @Post('refresh')
  refresh(@Body('refreshToken') refreshToken: string, @Ip() ip: string) {
    return this.authService.refresh(refreshToken, ip);
  }

  @Public()
  @Post('logout')
  async logout(@Body('refreshToken') refreshToken: string) {
    await this.authService.logout(refreshToken);
    return { success: true };
  }

  @Post('2fa/generate')
  generateTwoFactor(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.generateTwoFactorSecret(user.id);
  }

  @Post('2fa/enable')
  enableTwoFactor(
    @CurrentUser() user: AuthenticatedUser,
    @Body('code') code: string,
  ) {
    return this.authService.enableTwoFactor(user.id, code);
  }

  @Post('2fa/disable')
  disableTwoFactor(
    @CurrentUser() user: AuthenticatedUser,
    @Body('code') code: string,
  ) {
    return this.authService.disableTwoFactor(user.id, code);
  }

  @Post('impersonate/:userId')
  @RequirePermissions('users.impersonate')
  impersonate(
    @CurrentUser() admin: AuthenticatedUser,
    @Body('userId') userId: string,
    @Ip() ip: string,
  ) {
    return this.authService.impersonate(admin.id, userId, ip);
  }

  // ---------------------------------------------------------------------
  // OAuth2 / OIDC
  // ---------------------------------------------------------------------

  @Public()
  @Get('discord')
  @UseGuards(AuthGuard('discord'))
  discordAuth() {}

  @Public()
  @Get('discord/callback')
  @UseGuards(AuthGuard('discord'))
  async discordCallback(@Req() req: Request, @Ip() ip: string) {
    const user = req.user as { id: string };
    return this.authService.login(user.id, undefined, ip);
  }

  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth() {}

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: Request, @Ip() ip: string) {
    const user = req.user as { id: string };
    return this.authService.login(user.id, undefined, ip);
  }

  @Public()
  @Get('github')
  @UseGuards(AuthGuard('github'))
  githubAuth() {}

  @Public()
  @Get('github/callback')
  @UseGuards(AuthGuard('github'))
  async githubCallback(@Req() req: Request, @Ip() ip: string) {
    const user = req.user as { id: string };
    return this.authService.login(user.id, undefined, ip);
  }
}
