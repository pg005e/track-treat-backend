import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards';
import { CurrentUser } from 'src/auth/decorators';
import { MealPlanService } from './meal-plan.service';
import { GeneratePlanDto } from './dto';

@Controller('meal-plans')
@UseGuards(JwtAuthGuard)
export class MealPlanController {
  constructor(private readonly mealPlanService: MealPlanService) {}

  @Post('generate')
  generate(
    @CurrentUser('id') userId: number,
    @Body() dto: GeneratePlanDto,
  ) {
    return this.mealPlanService.generate(userId, dto);
  }

  @Get('active')
  getActive(@CurrentUser('id') userId: number) {
    return this.mealPlanService.getActive(userId);
  }

  @Get(':id')
  getById(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.mealPlanService.getById(userId, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.mealPlanService.cancel(userId, id);
  }
}
