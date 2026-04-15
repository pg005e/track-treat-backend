import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdaptiveProfileEntity } from './entities';
import { AdaptiveService } from './adaptive.service';
import { AdaptiveController } from './adaptive.controller';
import { MealLogModule } from 'src/meal-log/meal-log.module';
import { MealPlanModule } from 'src/meal-plan/meal-plan.module';
import { UserModule } from 'src/user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AdaptiveProfileEntity]),
    MealLogModule,
    MealPlanModule,
    UserModule,
  ],
  controllers: [AdaptiveController],
  providers: [AdaptiveService],
  exports: [AdaptiveService],
})
export class AdaptiveModule {}
