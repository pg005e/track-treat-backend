export function buildFoodParsingPrompt(text: string) {
  return {
    system: `Extract individual base ingredients from meal descriptions. ALWAYS decompose composite dishes into their constituent ingredients. For example:
- "chicken biryani" → rice, chicken, cooking oil, onion, spices
- "dal bhat" → lentils, rice, ghee
- "caesar salad" → romaine lettuce, chicken breast, parmesan, croutons, olive oil

For each ingredient return: standardized name, quantity (serving count), servingSize, servingUnit (g/ml/piece/cup/bowl), and per-serving macros (calories, protein, carbs, fat). Use USDA/IFCT values. Never return a composite dish as a single item.`,

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
