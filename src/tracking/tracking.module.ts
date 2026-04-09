import { Module } from '@nestjs/common';
import { MealLogModule } from 'src/meal-log/meal-log.module';
import { UserModule } from 'src/user/user.module';
import { TrackingService } from './tracking.service';
import { TrackingController } from './tracking.controller';

@Module({
  imports: [MealLogModule, UserModule],
  controllers: [TrackingController],
  providers: [TrackingService],
})
export class TrackingModule {}
