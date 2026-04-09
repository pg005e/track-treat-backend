import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('/health-check')
  healthCheck() {
    return { success: true, message: '/ says hello' };
  }
}
