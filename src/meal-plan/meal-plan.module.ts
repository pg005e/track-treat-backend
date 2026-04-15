import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from 'src/user/user.module';
import { FoodModule } from 'src/food/food.module';
import { MealPlan, MealPlanItem } from './entities';
import { AdaptiveProfileEntity } from 'src/adaptive/entities';
import { MealPlanService } from './meal-plan.service';
import { MealPlanController } from './meal-plan.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([MealPlan, MealPlanItem, AdaptiveProfileEntity]),
    UserModule,
    FoodModule,
  ],
  controllers: [MealPlanController],
  providers: [MealPlanService],
  exports: [MealPlanService],
})
export class MealPlanModule {}
