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
import { WaterLogService } from './water-log.service';
import { CreateWaterLogDto } from './dto';

@Controller('water-logs')
@UseGuards(JwtAuthGuard)
export class WaterLogController {
  constructor(private readonly waterLogService: WaterLogService) {}

  @Post()
  create(
    @CurrentUser('id') userId: number,
    @Body() dto: CreateWaterLogDto,
  ) {
    return this.waterLogService.create(userId, dto);
  }

  @Get('summary')
  getDailySummary(
    @CurrentUser('id') userId: number,
    @Query('date') date?: string,
  ) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    return this.waterLogService.getDailySummary(userId, targetDate);
  }

  @Delete(':id')
  delete(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) logId: number,
  ) {
    return this.waterLogService.delete(userId, logId);
  }
}
