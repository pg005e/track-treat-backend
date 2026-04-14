import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WaterLog } from './entities';
import { CreateWaterLogDto } from './dto';
import { UserService } from 'src/user/user.service';

@Injectable()
export class WaterLogService {
  constructor(
    @InjectRepository(WaterLog)
    private readonly waterLogRepo: Repository<WaterLog>,
    private readonly userService: UserService,
  ) {}

  async create(userId: number, dto: CreateWaterLogDto) {
    const log = this.waterLogRepo.create({
      userId,
      amount: dto.amount,
      loggedAt: dto.loggedAt || new Date().toISOString().split('T')[0],
    });
    return this.waterLogRepo.save(log);
  }

  async getDailySummary(userId: number, date: string) {
    const logs = await this.waterLogRepo.find({
      where: { userId, loggedAt: date },
      order: { createdAt: 'ASC' },
    });

    const totalMl = logs.reduce((sum, l) => sum + Number(l.amount), 0);

    let target = 2500;
    try {
      const profile = await this.userService.getProfile(userId);
      if (profile.dailyWaterTarget) {
        target = Number(profile.dailyWaterTarget);
      }
    } catch {}

    return {
      date,
      totalMl: Math.round(totalMl),
      target,
      percentage: target > 0 ? Math.round((totalMl / target) * 100) : 0,
      logs,
    };
  }

  async delete(userId: number, logId: number) {
    const log = await this.waterLogRepo.findOne({
      where: { id: logId, userId },
    });
    if (!log) {
      throw new NotFoundException('Water log not found');
    }
    await this.waterLogRepo.remove(log);
  }
}
