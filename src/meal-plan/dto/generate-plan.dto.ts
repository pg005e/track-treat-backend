import { IsDateString, IsOptional } from 'class-validator';

export class GeneratePlanDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;
}
