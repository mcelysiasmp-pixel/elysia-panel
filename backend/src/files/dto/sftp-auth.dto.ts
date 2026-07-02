import { IsString } from 'class-validator';

export class SftpAuthDto {
  @IsString()
  username!: string;

  @IsString()
  password!: string;
}
