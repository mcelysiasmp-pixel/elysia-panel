import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateNodeDto {
  @IsString()
  name!: string;

  @IsString()
  fqdn!: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsString()
  grpcHost!: string;

  @IsOptional()
  @IsInt()
  grpcPort?: number;

  @IsInt()
  @Min(1)
  cpuCores!: number;

  @IsInt()
  @Min(256)
  memoryMb!: number;

  @IsInt()
  @Min(1024)
  diskMb!: number;

  @IsString()
  dockerNetworkSubnet!: string;
}
