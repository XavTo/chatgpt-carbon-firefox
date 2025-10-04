import { IsEmail, IsString, MaxLength, MinLength, Matches } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MaxLength(255)
  password!: string;
}
