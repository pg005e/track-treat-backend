import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WeightLog } from './entities';
import { Profile } from 'src/user/entities/profile.entity';
import { WeightLogService } from './weight-log.service';
import { WeightLogController } from './weight-log.controller';

@Module({
  imports: [TypeOrmModule.forFeature([WeightLog, Profile])],
  controllers: [WeightLogController],
  providers: [WeightLogService],
  exports: [WeightLogService],
})
export class WeightLogModule {}
