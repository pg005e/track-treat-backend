import { IsDateString, IsOptional } from 'class-validator';

export class QueryMealLogDto {
  @IsDateString()
  date: string; // YYYY-MM-DD

  @IsOptional()
  @IsDateString()
  endDate?: string; // for range queries
}
