import { IsNumber, IsOptional, IsString, Min, Max } from 'class-validator';

export class UpdatePlanItemDto {
  @IsOptional()
  @IsNumber()
  foodItemId?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  quantity?: number;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class AddPlanItemDto {
  @IsNumber()
  @Min(1)
  @Max(7)
  day: number;

  @IsString()
  mealType: string;

  @IsNumber()
  foodItemId: number;

  @IsNumber()
  @Min(0.01)
  quantity: number;

  @IsOptional()
  @IsString()
  notes?: string | null;
}
