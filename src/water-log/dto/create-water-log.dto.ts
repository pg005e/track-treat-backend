import { IsDateString, IsNumber, IsOptional, Min } from 'class-validator';

export class CreateWaterLogDto {
  @IsNumber()
  @Min(1)
  amount: number; // ml

  @IsOptional()
  @IsDateString()
  loggedAt?: string;
}
