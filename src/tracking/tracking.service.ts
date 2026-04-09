import { Injectable } from '@nestjs/common';
import { MealLogService } from 'src/meal-log/meal-log.service';
import { UserService } from 'src/user/user.service';

@Injectable()
export class TrackingService {
  constructor(
    private readonly mealLogService: MealLogService,
    private readonly userService: UserService,
  ) {}

  async getDailyProgress(userId: number, date: string) {
    const [profile, summary] = await Promise.all([
      this.userService.getProfile(userId),
      this.mealLogService.getDailySummary(userId, date),
    ]);

    const target = Number(profile.targetCalories) || 0;
    const consumed = summary.totals.calories;
    const remaining = Math.max(0, target - consumed);
    const percentage = target > 0 ? Math.round((consumed / target) * 100) : 0;

    return {
      date,
      target,
      consumed,
      remaining,
      percentage,
      macros: {
        protein: summary.totals.protein,
        carbs: summary.totals.carbs,
        fat: summary.totals.fat,
      },
      meals: summary.meals,
      logCount: summary.logCount,
    };
  }

  async getWeeklyOverview(userId: number, startDate: string) {
    const profile = await this.userService.getProfile(userId);
    const target = Number(profile.targetCalories) || 0;
    const days: Array<{
      date: string;
      consumed: number;
      target: number;
      delta: number;
    }> = [];

    const start = new Date(startDate);
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];

      const summary = await this.mealLogService.getDailySummary(
        userId,
        dateStr,
      );
      days.push({
        date: dateStr,
        consumed: summary.totals.calories,
        target,
        delta: summary.totals.calories - target,
      });
    }

    const totalConsumed = days.reduce((sum, d) => sum + d.consumed, 0);
    const avgDaily = Math.round(totalConsumed / 7);
    const daysOnTrack = days.filter(
      (d) => d.consumed > 0 && Math.abs(d.delta) <= target * 0.1,
    ).length;

    return {
      startDate,
      days,
      summary: {
        totalConsumed,
        avgDaily,
        weeklyTarget: target * 7,
        daysOnTrack,
        daysLogged: days.filter((d) => d.consumed > 0).length,
      },
    };
  }
}
