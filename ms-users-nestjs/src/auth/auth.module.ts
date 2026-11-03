import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
// <-- NUEVO: Importar fs para leer los archivos pem
import * as fs from 'fs';

import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './strategies/jwt.strategy/jwt.strategy.js';
import { UsersModule } from '../users/users.module.js';

@Module({
  imports: [
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // <-- CAMBIO: Configuración asíncrona del JWT Module
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        // Leemos las rutas de las variables de entorno
        const privateKeyPath = configService.getOrThrow<string>('JWT_PRIVATE_KEY_PATH');
        const publicKeyPath = configService.getOrThrow<string>('JWT_PUBLIC_KEY_PATH');

        return {
          // <-- NUEVO: Cargamos ambas claves. La privada firma, la pública verifica.
          privateKey: fs.readFileSync(privateKeyPath, 'utf8'),
          publicKey: fs.readFileSync(publicKeyPath, 'utf8'),
          signOptions: {
            algorithm: 'RS256', // <-- CAMBIO: Firmar con algoritmo asimétrico
            expiresIn: configService.get<number>('JWT_EXPIRES_IN_SECONDS'),
            issuer: configService.get<string>('JWT_ISSUER'),
            audience: configService.get<string>('JWT_AUDIENCE'),
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}