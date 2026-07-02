import { IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class CreateServerDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  templateId!: string;

  @IsInt()
  @Min(10)
  cpuLimitPct!: number;

  @IsInt()
  @Min(256)
  memoryLimitMb!: number;

  @IsInt()
  @Min(512)
  diskLimitMb!: number;

  @IsOptional()
  @IsObject()
  environment?: Record<string, string>;

  // Réservé aux admins : assigner explicitement le propriétaire (sinon = créateur)
  @IsOptional()
  @IsString()
  ownerId?: string;
}
