import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { UsersService } from '../users/users.service.js';
import { LoginDto } from './dto/login.dto/login.dto.js';
import { JwtPayload } from './interfaces/jwt-payload/jwt-payload.interface.js';

// <-- NUEVO: Importamos el DTO que acabamos de crear -->
import { CheckAuthorizationDto } from './dto/check-authorization.dto.js';

@Injectable()
export class AuthService implements OnModuleInit {
  private dummyHash = '';

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await argon2.hash(randomBytes(32).toString('hex'), {
      type: argon2.argon2id,
    });
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findForAuthentication(dto.identifier);

    const hash = user?.passwordHash ?? this.dummyHash;
    const validPassword = await argon2.verify(hash, dto.password);

    if (!user || !validPassword) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      tokenVersion: user.tokenVersion,
      typ: 'access',
    };

    const accessToken = await this.jwtService.signAsync(payload);

    const currentUser = await this.usersService.findActiveWithRoles(user.id);
    const roles =
      currentUser?.userRoles
        ?.filter((userRole) => userRole.estado && userRole.role?.estado)
        .map((userRole) => userRole.role.rol) ?? [];

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn:
        this.configService.get<number>('JWT_EXPIRES_IN_SECONDS') ?? 900,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        roles: [...new Set(roles)],
      },
    };
  }

  async logout(userId: string): Promise<void> {
    await this.usersService.incrementTokenVersion(userId);
  }

  // <-- NUEVO: METODO PARA EL MICROSERVICIO STEGO (ANEXO B) -->
  async checkAuthorization(dto: CheckAuthorizationDto) {
    try {
      // 1. Verificamos la firma y expiración del token enviado por STEGO
      const payload = await this.jwtService.verifyAsync<JwtPayload>(dto.subject_token);

      // 2. Buscamos al usuario en la BD (Autorización dinámica)
      const user = await this.usersService.findActiveWithRoles(payload.sub);

      if (!user) {
        return {
          subject_id: payload.sub,
          action: dto.action,
          allowed: false,
          reason: 'user_not_found_or_inactive',
        };
      }

      // 3. Verificamos si la sesión fue cerrada (logout)
      if (payload.tokenVersion !== user.tokenVersion) {
        return {
          subject_id: payload.sub,
          action: dto.action,
          allowed: false,
          reason: 'session_expired',
        };
      }

      // 4. Extraemos los roles actuales
      const roles = user.userRoles
        ?.filter((userRole) => userRole.estado && userRole.role?.estado)
        .map((userRole) => userRole.role.rol.toUpperCase()) ?? [];

      // 5. Validamos si tiene permiso para la acción.
      // El proyecto dice que analizar imágenes requiere rol ADMIN o ANALYST.
      let allowed = false;
      let reason = 'insufficient_permissions';

      if (dto.action === 'steganography.analyze') {
        if (roles.includes('ADMIN') || roles.includes('ANALYST')) {
          allowed = true;
          reason = 'active_role_grants_permission';
        }
      } else if (
        dto.action === 'steganography.view_result' ||
        dto.action === 'steganography.results.view'
      ) {
        if (roles.includes('ADMIN') || roles.includes('ANALYST')) {
          allowed = true;
          reason = 'active_role_grants_permission';
        } else {
          reason = 'user_role_lacks_permission';
        }
      } else {
        // En caso de que STEGO pregunte por otra ruta a futuro
        reason = 'unknown_action'; 
      }

      // 6. Retornamos el formato JSON exacto que pide el Anexo B
      return {
        subject_id: user.id,
        action: dto.action,
        allowed,
        reason,
      };

    } catch (error) {
      // Si el token fue manipulado o expiró, denegamos el acceso (Fallo seguro)
      return {
        subject_id: null,
        action: dto.action,
        allowed: false,
        reason: 'invalid_or_expired_token',
      };
    }
  }
  // <-- FIN DEL NUEVO METODO -->
}