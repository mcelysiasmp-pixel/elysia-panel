import { Controller, Get, Query } from '@nestjs/common';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AuditService } from './audit.service';

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('audit.read')
  list(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('actorId') actorId?: string,
    @Query('targetType') targetType?: string,
  ) {
    return this.audit.list({
      skip: skip ? parseInt(skip, 10) : undefined,
      take: take ? parseInt(take, 10) : undefined,
      actorId,
      targetType,
    });
  }
}
