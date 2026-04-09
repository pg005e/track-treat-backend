import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FoodModule } from 'src/food/food.module';
import { MealLog } from './entities';
import { MealLogService } from './meal-log.service';
import { MealLogController } from './meal-log.controller';

@Module({
  imports: [TypeOrmModule.forFeature([MealLog]), FoodModule],
  controllers: [MealLogController],
  providers: [MealLogService],
  exports: [MealLogService],
})
export class MealLogModule {}
