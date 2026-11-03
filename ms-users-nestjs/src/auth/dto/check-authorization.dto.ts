import { IsOptional, IsString } from 'class-validator';

export class CheckAuthorizationDto {
  // El JWT del cliente que STEGO nos envía para analizar
  @IsString()
  subject_token!: string;

  // La acción que el usuario quiere realizar (ej. 'steganography.analyze')
  @IsString()
  action!: string;

  // Opcional, por si la acción recae sobre un recurso específico
  @IsOptional()
  @IsString()
  resource_id?: string | null;
}