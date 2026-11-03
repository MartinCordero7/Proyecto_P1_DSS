import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { UserRole } from '../../user-roles/entities/user-role.entity.js';

@Entity({
  name: 'roles',
})
@Index('UQ_roles_name', ['rol'], {
  unique: true,
})
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Mapeado a 'name' en BD según el anexo, pero mantiene 'rol' en TypeScript
  @Column({
    name: 'name',
    type: 'varchar',
    length: 50,
  })
  rol!: string; 

  // Nuevo campo requerido por el anexo
  @Column({
    name: 'description',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  descripcion!: string;

  @Column({
    type: 'boolean',
    default: true,
  })
  estado!: boolean;

  @VersionColumn({
    name: 'version',
  })
  version!: number;

  @CreateDateColumn({
    name: 'fecha_creacion',
    type: 'timestamp',
  })
  fechaCreacion!: Date;

  @UpdateDateColumn({
    name: 'fecha_actualizacion',
    type: 'timestamp',
  })
  fechaActualizacion!: Date;

  @DeleteDateColumn({
    name: 'fecha_eliminacion',
    type: 'timestamp',
    nullable: true,
  })
  fechaEliminacion!: Date | null;

  @OneToMany(() => UserRole, (userRole) => userRole.role)
  userRoles!: Relation<UserRole[]>;
}
