import { IsDateString, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class CreateWeightLogDto {
  @IsNumber()
  @Min(20)
  @Max(500)
  weight: number; // kg

  @IsOptional()
  @IsDateString()
  loggedAt?: string;
}
