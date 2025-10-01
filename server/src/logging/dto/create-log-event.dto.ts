import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateLogEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  type!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  requestId?: string;

  @IsObject()
  payload!: Record<string, unknown>;
}
