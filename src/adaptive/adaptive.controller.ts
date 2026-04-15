import {
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards';
import { CurrentUser } from 'src/auth/decorators';
import { AdaptiveService } from './adaptive.service';

@Controller('adaptive')
@UseGuards(JwtAuthGuard)
export class AdaptiveController {
  constructor(private readonly adaptiveService: AdaptiveService) {}

  @Post('compute')
  compute(
    @CurrentUser('id') userId: number,
    @Query('weekStartDate') weekStartDate?: string,
  ) {
    return this.adaptiveService.computeAndStore(userId, weekStartDate);
  }

  @Get('current')
  getCurrent(@CurrentUser('id') userId: number) {
    return this.adaptiveService.getCurrent(userId);
  }

  @Get('history')
  getHistory(@CurrentUser('id') userId: number) {
    return this.adaptiveService.getHistory(userId);
  }
}
