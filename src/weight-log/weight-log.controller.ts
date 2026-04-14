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
import { WeightLogService } from './weight-log.service';
import { CreateWeightLogDto, QueryWeightLogDto } from './dto';

@Controller('weight-logs')
@UseGuards(JwtAuthGuard)
export class WeightLogController {
  constructor(private readonly weightLogService: WeightLogService) {}

  @Post()
  create(
    @CurrentUser('id') userId: number,
    @Body() dto: CreateWeightLogDto,
  ) {
    return this.weightLogService.create(userId, dto);
  }

  @Get()
  getHistory(
    @CurrentUser('id') userId: number,
    @Query() dto: QueryWeightLogDto,
  ) {
    return this.weightLogService.getHistory(userId, dto);
  }

  @Delete(':id')
  delete(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) logId: number,
  ) {
    return this.weightLogService.delete(userId, logId);
  }
}
