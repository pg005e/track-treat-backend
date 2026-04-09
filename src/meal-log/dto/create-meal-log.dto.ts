import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';
import { MealType } from '../entities/meal-log.entity';

export class CreateMealLogDto {
  @IsNumber()
  foodItemId: number;

  @IsNumber()
  @Min(0.01)
  quantity: number;

  @IsEnum(MealType)
  mealType: MealType;

  @IsOptional()
  @IsDateString()
  loggedAt?: string; // defaults to today
}
