import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards';
import { CurrentUser } from 'src/auth/decorators';
import { MealLogService } from './meal-log.service';
import { CreateMealLogDto, QueryMealLogDto } from './dto';

@Controller('meal-logs')
@UseGuards(JwtAuthGuard)
export class MealLogController {
  constructor(private readonly mealLogService: MealLogService) {}

  @Post()
  create(
    @CurrentUser('id') userId: number,
    @Body() dto: CreateMealLogDto,
  ) {
    return this.mealLogService.create(userId, dto);
  }

  @Get()
  getByDate(
    @CurrentUser('id') userId: number,
    @Query() dto: QueryMealLogDto,
  ) {
    return this.mealLogService.getByDate(userId, dto);
  }

  @Get('summary')
  getDailySummary(
    @CurrentUser('id') userId: number,
    @Query('date') date: string,
  ) {
    return this.mealLogService.getDailySummary(userId, date);
  }

  @Delete(':id')
  delete(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) logId: number,
  ) {
    return this.mealLogService.delete(userId, logId);
  }
}
