export function buildFoodParsingPrompt(text: string) {
  return {
    system: `Decompose meal descriptions into individual base ingredients.
Never return a composite dish as one item. Always break it down.

Examples:
  "dal bhat"       → lentils 180g, rice 150g, ghee 5g
  "chicken biryani"→ basmati rice 150g, chicken 120g, onion 50g, oil 10g, spices 5g
  "caesar salad"   → romaine 80g, chicken breast 100g, parmesan 20g, olive oil 10g

For each ingredient: standardized name, quantity (number of servings), servingSize (numeric string), servingUnit (g or ml only), and macros per serving (calories, protein, carbs, fat) using USDA/IFCT values.`,

    user: text,
  };
}

export const foodParsingToolName = 'extract_food_items';
export const foodParsingToolDescription = 'Extract and decompose food items from a meal description';

export const foodParsingSchema = {
  type: 'object' as const,
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name:               { type: 'string' },
          quantity:           { type: 'number' },
          servingSize:        { type: 'string' },
          servingUnit:        { type: 'string', enum: ['g', 'ml'] },
          estimatedCalories:  { type: 'number' },
          estimatedProtein:   { type: 'number' },
          estimatedCarbs:     { type: 'number' },
          estimatedFat:       { type: 'number' },
        },
        required: [
          'name', 'quantity', 'servingSize', 'servingUnit',
          'estimatedCalories', 'estimatedProtein', 'estimatedCarbs', 'estimatedFat',
        ],
      },
    },
  },
  required: ['items'],
};

export interface FoodParsingResult {
  items: Array<{
    name:               string;
    quantity:           number;
    servingSize:        string;
    servingUnit:        'g' | 'ml';
    estimatedCalories:  number;
    estimatedProtein:   number;
    estimatedCarbs:     number;
    estimatedFat:       number;
  }>;
}
