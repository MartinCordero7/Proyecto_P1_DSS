import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
// <-- NUEVO: Importar fs para leer el archivo de la clave pública
import * as fs from 'fs'; 
import { JwtPayload } from '../../interfaces/jwt-payload/jwt-payload.interface.js';
import { AuthenticatedUser } from '../../interfaces/authenticated-user/authenticated-user.interface.js';
import { UsersService } from '../../../users/users.service.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    // <-- NUEVO: Leer la clave pública desde el sistema de archivos
    const publicKeyPath = configService.getOrThrow<string>('JWT_PUBLIC_KEY_PATH');
    const publicKey = fs.readFileSync(publicKeyPath, 'utf8');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // <-- CAMBIO: Usar la clave pública cargada en lugar del texto secreto
      secretOrKey: publicKey, 
      issuer: configService.getOrThrow<string>('JWT_ISSUER'),
      audience: configService.getOrThrow<string>('JWT_AUDIENCE'),
      // <-- CAMBIO: Exigir estrictamente el algoritmo asimétrico RS256
      algorithms: ['RS256'], 
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    /*
     * Solamente aceptamos
     * access tokens.
     */
    if (payload.typ !== 'access') {
      throw new UnauthorizedException('Token inválido');
    }

    /*
     * Consultamos PostgreSQL para verificar
     * el estado actual del usuario y roles.
     */
    const user = await this.usersService.findActiveWithRoles(payload.sub);

    if (!user) {
      throw new UnauthorizedException('Usuario no autorizado');
    }

    if (payload.tokenVersion !== user.tokenVersion) {
      throw new UnauthorizedException('La sesión ha expirado');
    }

    /*
     * Los roles NO salen del JWT. Salen de la BD.
     */
    const roles =
      user.userRoles
        ?.filter(
          (userRole) =>
            userRole.estado &&
            userRole.role !== undefined &&
            userRole.role !== null &&
            userRole.role.estado,
        )
        .map((userRole) => userRole.role.rol) ?? [];

    return {
      userId: user.id,
      username: user.username,
      email: user.email,
      roles: [...new Set(roles)],
    };
  }
}
