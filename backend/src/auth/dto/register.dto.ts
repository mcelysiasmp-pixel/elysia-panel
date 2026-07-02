import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Matches(/^[a-zA-Z0-9_]{3,32}$/, {
    message:
      "Le nom d'utilisateur doit faire 3 à 32 caractères alphanumériques ou '_'",
  })
  username!: string;

  @IsString()
  @MinLength(10, {
    message: 'Le mot de passe doit faire au moins 10 caractères',
  })
  password!: string;
}
