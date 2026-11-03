import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';

import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { Public } from './decorators/public/public.decorator.js';
import { LoginDto } from './dto/login.dto/login.dto.js';
import { CurrentUser } from './decorators/current-user/current-user.decorator.js';
import type { AuthenticatedUser } from './interfaces/authenticated-user/authenticated-user.interface.js';
import { CheckAuthorizationDto } from './dto/check-authorization.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /*
   * Ruta pública.
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit: 5,
      ttl: 60_000,
    },
  })
  login(
    @Body()
    dto: LoginDto,
  ) {
    return this.authService.login(dto);
  }

  /*
   * Requiere JWT.
   *
   * No requiere rol particular.
   */
  @Get('me')
  me(
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return user;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentUser()
    user: AuthenticatedUser,
  ): Promise<void> {
    await this.authService.logout(user.userId);
  }

  // <-- CAMBIO APLICADO AQUÍ -->
  // 1. Agregamos el decorador @Public() para evitar que el JwtAuthGuard global bloquee la petición
  // 2. Mantenemos el @Body() dto: CheckAuthorizationDto para recibir el token de STEGO
  @Public()
  @Post('internal/authorization/check')
  @HttpCode(HttpStatus.OK)
  checkAuthorization(@Body() dto: CheckAuthorizationDto) {
    return this.authService.checkAuthorization(dto);
  }
}