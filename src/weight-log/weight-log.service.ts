import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { WeightLog } from './entities';
import { CreateWeightLogDto, QueryWeightLogDto } from './dto';
import { Profile } from 'src/user/entities/profile.entity';

@Injectable()
export class WeightLogService {
  constructor(
    @InjectRepository(WeightLog)
    private readonly weightLogRepo: Repository<WeightLog>,
    @InjectRepository(Profile)
    private readonly profileRepo: Repository<Profile>,
  ) {}

  async create(userId: number, dto: CreateWeightLogDto) {
    const loggedAt = dto.loggedAt || new Date().toISOString().split('T')[0];

    // Upsert: if entry exists for this date, update it
    const existing = await this.weightLogRepo.findOne({
      where: { userId, loggedAt },
    });

    let log: WeightLog;
    if (existing) {
      existing.weight = dto.weight;
      log = await this.weightLogRepo.save(existing);
    } else {
      log = this.weightLogRepo.create({
        userId,
        weight: dto.weight,
        loggedAt,
      });
      log = await this.weightLogRepo.save(log);
    }

    // Update profile.currentWeight
    await this.profileRepo.update({ userId }, { currentWeight: dto.weight });

    return log;
  }

  async getHistory(userId: number, dto: QueryWeightLogDto) {
    const where: any = { userId };

    if (dto.startDate && dto.endDate) {
      where.loggedAt = Between(dto.startDate, dto.endDate);
    } else if (dto.startDate) {
      where.loggedAt = MoreThanOrEqual(dto.startDate);
    } else if (dto.endDate) {
      where.loggedAt = LessThanOrEqual(dto.endDate);
    }

    return this.weightLogRepo.find({
      where,
      order: { loggedAt: 'ASC' },
    });
  }

  async delete(userId: number, logId: number) {
    const log = await this.weightLogRepo.findOne({
      where: { id: logId, userId },
    });
    if (!log) {
      throw new NotFoundException('Weight log not found');
    }
    await this.weightLogRepo.remove(log);
  }
}
