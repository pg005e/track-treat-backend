import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { MealType } from '../entities/meal-log.entity';

export class ParseTextDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  text: string;

  @IsEnum(MealType)
  mealType: MealType;

  @IsOptional()
  @IsDateString()
  loggedAt?: string;
}
