export function buildFoodParsingPrompt(text: string) {
  return {
    system: `Extract food items from meal descriptions. For each item return: standardized name, quantity (serving count), servingSize, servingUnit (g/ml/piece/cup/bowl), and per-serving macros (calories, protein, carbs, fat).

Convert user quantities to servings (e.g. "400g" with 100g serving = quantity 4). Always extract at least one item. Use reasonable defaults for ambiguous input.`,

    user: text,
  };
}

export const foodParsingToolName = 'extract_food_items';

export const foodParsingToolDescription = 'Extract food items from text';

export const foodParsingSchema = {
  type: 'object' as const,
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          quantity: { type: 'number' },
          servingSize: { type: 'string' },
          servingUnit: { type: 'string' },
          estimatedCalories: { type: 'number' },
          estimatedProtein: { type: 'number' },
          estimatedCarbs: { type: 'number' },
          estimatedFat: { type: 'number' },
        },
        required: ['name', 'quantity', 'servingSize', 'servingUnit', 'estimatedCalories', 'estimatedProtein', 'estimatedCarbs', 'estimatedFat'],
      },
    },
  },
  required: ['items'],
};

export interface FoodParsingResult {
  items: Array<{
    name: string;
    quantity: number;
    servingSize: string;
    servingUnit: string;
    estimatedCalories: number;
    estimatedProtein: number;
    estimatedCarbs: number;
    estimatedFat: number;
  }>;
}
