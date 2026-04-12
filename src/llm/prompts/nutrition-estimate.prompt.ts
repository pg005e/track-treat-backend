export function buildNutritionEstimatePrompt(foodName: string) {
  return {
    system: `Nutrition database. Estimate per one standard serving. Use USDA/IFCT/NIN India values. For regional dishes, estimate from typical ingredients. Realistic values only.`,

    user: `Estimate nutrition for: "${foodName}"`,
  };
}

export const nutritionEstimateToolName = 'estimate_nutrition';

export const nutritionEstimateToolDescription = 'Nutrition per serving';

export const nutritionEstimateSchema = {
  type: 'object' as const,
  properties: {
    name: { type: 'string' },
    servingSize: { type: 'string' },
    servingUnit: { type: 'string' },
    calories: { type: 'number' },
    protein: { type: 'number' },
    carbs: { type: 'number' },
    fat: { type: 'number' },
    fiber: { type: 'number' },
    category: { type: 'string' },
  },
  required: ['name', 'servingSize', 'servingUnit', 'calories', 'protein', 'carbs', 'fat', 'fiber', 'category'],
};

export interface NutritionEstimateResult {
  name: string;
  servingSize: string;
  servingUnit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  category: string;
}
