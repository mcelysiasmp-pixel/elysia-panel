import { IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateServerDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  dockerImage?: string;

  @IsOptional()
  @IsString()
  startupCommand?: string;

  @IsOptional()
  @IsObject()
  environment?: Record<string, string>;
}
