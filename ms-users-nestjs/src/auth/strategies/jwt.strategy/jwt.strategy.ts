// jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../../interfaces/jwt-payload/jwt-payload.interface.js';
import { AuthenticatedUser } from '../../interfaces/authenticated-user/authenticated-user.interface.js';
import { UsersService } from '../../../users/users.service.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      /*
       * Authorization:
       * Bearer eyJ...
       */
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
      issuer: configService.getOrThrow<string>('JWT_ISSUER'),
      audience: configService.getOrThrow<string>('JWT_AUDIENCE'),
      algorithms: ['HS256'],
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
     * Consultamos PostgreSQL.
     */
    const user = await this.usersService.findActiveWithRoles(payload.sub);

    if (!user) {
      throw new UnauthorizedException('Usuario no autorizado o inactivo');
    }

    /*
     * Verificación de cierre de sesión.
     * CORRECCIÓN: Si user.tokenVersion es undefined, lo tomamos como 0
     * para evitar falsos positivos de sesión expirada.
     */
    const currentTokenVersion = user.tokenVersion ?? 0;
    
    if (payload.tokenVersion !== currentTokenVersion) {
      throw new UnauthorizedException('La sesión ha expirado');
    }

    /*
     * Extraemos los roles de la base de datos
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
