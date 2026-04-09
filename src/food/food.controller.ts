import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards';
import { CurrentUser } from 'src/auth/decorators';
import { FoodService } from './food.service';
import { CreateFoodItemDto, SearchFoodDto } from './dto';

@Controller('food')
@UseGuards(JwtAuthGuard)
export class FoodController {
  constructor(private readonly foodService: FoodService) {}

  @Get('search')
  search(@Query() dto: SearchFoodDto) {
    return this.foodService.search(dto);
  }

  @Get('categories')
  getCategories() {
    return this.foodService.getCategories();
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.foodService.findById(id);
  }

  @Post()
  createUserFood(
    @CurrentUser('id') userId: number,
    @Body() dto: CreateFoodItemDto,
  ) {
    return this.foodService.createUserFood(userId, dto);
  }
}
