// users.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards, // <-- CAMBIO 1: Asegúrate de exportar UseGuards de @nestjs/common
} from '@nestjs/common';

import { Throttle } from '@nestjs/throttler';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UsersService } from './users.service.js';
import { CedulaPipe } from '../common/pipes/cedula/cedula.pipe.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto/pagination-query.dto.js';
import { Roles } from '../auth/decorators/roles/roles.decorator.js';

// importacion de decoradores y guards para la autenticacion y autorizacion
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles/roles.guard.js';

@Controller('users')
// <-- CAMBIO 2: Aplicamos los guards a todo el controlador.
// 1. JwtAuthGuard: Valida la firma del token y que no esté expirado.
// 2. RolesGuard: Intercepta la petición, lee la BD y autoriza según el rol.
@UseGuards(JwtAuthGuard, RolesGuard) 
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles('ADMIN')
  @Throttle({
    default: {
      limit: 10,
      ttl: 60_000,
    },
  })
  create(
    @Body()
    dto: CreateUserDto,
  ) {
    return this.usersService.create(dto);
  }

  @Get()
  @Roles('ADMIN', 'OPERADOR')
  findAll(
    @Query()
    pagination: PaginationQueryDto,
  ) {
    return this.usersService.findAll(pagination);
  }

  @Get('cedula/:cedula')
  @Roles('ADMIN', 'OPERADOR')
  findByCedula(
    @Param('cedula', CedulaPipe)
    cedula: string,
  ) {
    return this.usersService.findByCedula(cedula);
  }

  @Get(':id')
  @Roles('ADMIN', 'OPERADOR')
  findOne(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,
  ) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,

    @Body()
    dto: UpdateUserDto,
  ) {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,
  ): Promise<void> {
    await this.usersService.remove(id);
  }
}
