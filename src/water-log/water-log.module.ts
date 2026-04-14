import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from 'src/user/user.module';
import { WaterLog } from './entities';
import { WaterLogService } from './water-log.service';
import { WaterLogController } from './water-log.controller';

@Module({
  imports: [TypeOrmModule.forFeature([WaterLog]), UserModule],
  controllers: [WaterLogController],
  providers: [WaterLogService],
  exports: [WaterLogService],
})
export class WaterLogModule {}
