import { Body, Controller, Post } from '@nestjs/common';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';

class LoginDto {
  @IsOptional() @IsString() tenantSlug?: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(6) password!: string;
}

class RegisterDto {
  @IsString() @MinLength(2) businessName!: string;
  @IsString() @MinLength(2) fullName!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(6) password!: string;
  @IsOptional() @IsString() gstin?: string;
  @IsOptional() @IsString() stateCode?: string;
  @IsOptional() @IsString() phone?: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.validateAndLogin(dto.tenantSlug, dto.email, dto.password);
  }

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }
}
