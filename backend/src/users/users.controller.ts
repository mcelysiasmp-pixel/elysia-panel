import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions('users.read')
  list(@Query('skip') skip?: string, @Query('take') take?: string) {
    return this.users.list({
      skip: skip ? parseInt(skip, 10) : undefined,
      take: take ? parseInt(take, 10) : undefined,
    });
  }

  @Get(':id')
  @RequirePermissions('users.read')
  get(@Param('id') id: string) {
    return this.users.findByIdOrThrow(id);
  }

  @Post()
  @RequirePermissions('users.create')
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.users.create(dto, actor.id);
  }

  @Patch(':id')
  @RequirePermissions('users.update')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.users.update(id, dto, actor.id);
  }

  @Post(':id/reset-password')
  @RequirePermissions('users.update')
  resetPassword(
    @Param('id') id: string,
    @Body('newPassword') newPassword: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.users.resetPassword(id, newPassword, actor.id);
  }

  @Post(':id/suspend')
  @RequirePermissions('users.suspend')
  suspend(@Param('id') id: string, @Body('reason') reason: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.users.suspend(id, reason, actor.id);
  }

  @Post(':id/ban')
  @RequirePermissions('users.ban')
  ban(@Param('id') id: string, @Body('reason') reason: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.users.ban(id, reason, actor.id);
  }

  @Post(':id/reactivate')
  @RequirePermissions('users.update')
  reactivate(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.users.reactivate(id, actor.id);
  }

  @Delete(':id')
  @RequirePermissions('users.delete')
  delete(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.users.delete(id, actor.id);
  }
}
