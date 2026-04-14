import { IsDateString, IsOptional } from 'class-validator';

export class QueryWeightLogDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
