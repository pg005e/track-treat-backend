import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards';
import { CurrentUser } from 'src/auth/decorators';
import { TrackingService } from './tracking.service';

@Controller('tracking')
@UseGuards(JwtAuthGuard)
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Get('daily')
  getDailyProgress(
    @CurrentUser('id') userId: number,
    @Query('date') date?: string,
  ) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    return this.trackingService.getDailyProgress(userId, targetDate);
  }

  @Get('weekly')
  getWeeklyOverview(
    @CurrentUser('id') userId: number,
    @Query('startDate') startDate?: string,
  ) {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    const defaultStart = monday.toISOString().split('T')[0];

    return this.trackingService.getWeeklyOverview(
      userId,
      startDate || defaultStart,
    );
  }

  @Get('adherence')
  getAdherence(
    @CurrentUser('id') userId: number,
    @Query('date') date: string,
  ) {
    return this.trackingService.getAdherence(userId, date);
  }

  @Get('feedback')
  getWeeklyFeedback(
    @CurrentUser('id') userId: number,
    @Query('startDate') startDate?: string,
  ) {
    return this.trackingService.getWeeklyFeedback(userId, startDate);
  }
}
