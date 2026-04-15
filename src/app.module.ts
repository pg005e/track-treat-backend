import { Logger, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { FoodModule } from './food/food.module';
import { MealLogModule } from './meal-log/meal-log.module';
import { TrackingModule } from './tracking/tracking.module';
import { EmailModule } from './email/email.module';
import { LlmModule } from './llm/llm.module';
import { MealPlanModule } from './meal-plan/meal-plan.module';
import { WaterLogModule } from './water-log/water-log.module';
import { WeightLogModule } from './weight-log/weight-log.module';
import { AdaptiveModule } from './adaptive/adaptive.module';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    EmailModule,
    LlmModule,
    AuthModule,
    UserModule,
    FoodModule,
    MealLogModule,
    MealPlanModule,
    WaterLogModule,
    WeightLogModule,
    AdaptiveModule,
    TrackingModule,
  ],
  controllers: [AppController],
  providers: [
    Logger,
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
