import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  ActivityLevel,
  BiologicalSex,
  DietaryGoal,
  DietaryLifestyle,
} from '../entities/profile.entity';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsEnum(BiologicalSex)
  biologicalSex?: BiologicalSex;

  @IsOptional()
  @IsNumber()
  @Min(50)
  @Max(300)
  heightCm?: number;

  @IsOptional()
  @IsNumber()
  @Min(20)
  @Max(500)
  currentWeight?: number;

  @IsOptional()
  @IsEnum(ActivityLevel)
  activityLevel?: ActivityLevel;

  @IsOptional()
  @IsEnum(DietaryGoal)
  dietaryGoal?: DietaryGoal;

  @IsOptional()
  @IsEnum(DietaryLifestyle)
  dietaryLifestyle?: DietaryLifestyle;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergies?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  restrictions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dislikes?: string[];

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(8)
  mealsPerDay?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  budgetPerDay?: number;

  @IsOptional()
  @IsNumber()
  @Min(500)
  @Max(10000)
  dailyWaterTarget?: number;
}
