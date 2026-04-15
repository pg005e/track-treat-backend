import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { FoodItem, FoodSource } from './entities/food-item.entity';
import { CreateFoodItemDto, SearchFoodDto } from './dto';

@Injectable()
export class FoodService {
  private readonly logger = new Logger(FoodService.name);

  constructor(
    @InjectRepository(FoodItem)
    private readonly foodItemRepo: Repository<FoodItem>,
  ) {}

  async search(dto: SearchFoodDto) {
    const where: Record<string, unknown> = {
      name: ILike(`%${dto.query}%`),
    };
    if (dto.category) {
      where.category = dto.category;
    }

    return this.foodItemRepo.find({
      where,
      take: dto.limit,
      order: { name: 'ASC' },
    });
  }

  /**
   * Search local DB by name. Returns null if not found.
   * Nutrition estimation for unknown foods is handled inline by the
   * food-parsing LLM prompt during meal logging.
   */
  async findByName(name: string): Promise<FoodItem | null> {
    return this.foodItemRepo.findOne({
      where: { name: ILike(`%${name}%`) },
    });
  }

  async findById(id: number) {
    return this.foodItemRepo.findOneByOrFail({ id });
  }

  async createUserFood(userId: number, dto: CreateFoodItemDto) {
    const item = this.foodItemRepo.create({
      ...dto,
      source: FoodSource.User,
      createdBy: userId,
    });
    return this.foodItemRepo.save(item);
  }

  async getCategories(): Promise<string[]> {
    const result = await this.foodItemRepo
      .createQueryBuilder('food')
      .select('DISTINCT food.category', 'category')
      .where('food.category IS NOT NULL')
      .orderBy('food.category', 'ASC')
      .getRawMany();

    return result.map((r) => r.category);
  }
}
