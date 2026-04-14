export interface MealPlanContext {
  targetCalories: number;
  mealsPerDay: number;
  dietaryLifestyle: string;
  region: string | null;
  allergies: string[];
  restrictions: string[];
  dislikes: string[];
  budgetPerDay: number | null;
  availableFoods: Array<{
    id: number;
    name: string;
    calories: number;
    category: string | null;
  }>;
}

export function buildMealPlanPrompt(ctx: MealPlanContext) {
  // Compact format: "id:name:cal" to minimize tokens
  const foodList = ctx.availableFoods
    .map((f) => `${f.id}:${f.name}:${f.calories}`)
    .join('; ');

  const constraints: string[] = [];
  if (ctx.dietaryLifestyle !== 'none') {
    constraints.push(`Dietary lifestyle: ${ctx.dietaryLifestyle}`);
  }
  if (ctx.allergies.length > 0) {
    constraints.push(`ALLERGIES (must avoid completely): ${ctx.allergies.join(', ')}`);
  }
  if (ctx.restrictions.length > 0) {
    constraints.push(`Restrictions: ${ctx.restrictions.join(', ')}`);
  }
  if (ctx.dislikes.length > 0) {
    constraints.push(`Dislikes (avoid if possible): ${ctx.dislikes.join(', ')}`);
  }
  if (ctx.budgetPerDay) {
    constraints.push(`Daily budget: ${ctx.budgetPerDay}`);
  }

  return {
    system: `Generate a 7-day meal plan. ${ctx.targetCalories} cal/day (±10%). ${ctx.mealsPerDay} meals/day: ${getMealTypeDistribution(ctx.mealsPerDay)}.${ctx.region ? ` User is from ${ctx.region} — use locally available, culturally appropriate foods from this region.` : ''}

Rules:
- ONLY whole, unprocessed, healthy foods. NO junk food, fast food, chips, soda, candy, packaged snacks, or deep-fried items.
- Prioritize fresh vegetables, fruits, whole grains, legumes, lean proteins, nuts, seeds, and healthy fats.
- servingSize MUST be a concrete weight/volume (e.g. "150" not "1"), servingUnit MUST be "g" or "ml". No vague units like "serving", "piece", "bowl".
- quantity is the number of servings (e.g. 1, 1.5, 2).
- NEVER include allergens. No consecutive-day repeats.
- Use foods from the list by exact ID when possible; set foodItemId=null for new foods with full macro estimates.
${constraints.length > 0 ? '\nConstraints: ' + constraints.join('. ') + '.' : ''}`,

    user: `Foods (id:name:cal): ${foodList || 'none — suggest common foods with estimates'}`,
  };
}

function getMealTypeDistribution(mealsPerDay: number): string {
  if (mealsPerDay <= 2) return 'lunch, dinner';
  if (mealsPerDay === 3) return 'breakfast, lunch, dinner';
  if (mealsPerDay === 4) return 'breakfast, lunch, snack, dinner';
  if (mealsPerDay === 5) return 'breakfast, snack, lunch, snack, dinner';
  return 'breakfast, snack, lunch, snack, dinner, snack';
}

export const mealPlanToolName = 'create_meal_plan';

export const mealPlanToolDescription = '7-day meal plan';

export const mealPlanSchema = {
  type: 'object' as const,
  properties: {
    days: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          day: { type: 'integer' },
          meals: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                mealType: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
                foodItemId: { type: ['integer', 'null'] },
                foodName: { type: 'string' },
                quantity: { type: 'number' },
                servingSize: { type: 'string' },
                servingUnit: { type: 'string' },
                estimatedCalories: { type: 'number' },
                estimatedProtein: { type: 'number' },
                estimatedCarbs: { type: 'number' },
                estimatedFat: { type: 'number' },
                notes: { type: ['string', 'null'] },
              },
              required: ['mealType', 'foodItemId', 'foodName', 'quantity', 'servingSize', 'servingUnit', 'estimatedCalories', 'estimatedProtein', 'estimatedCarbs', 'estimatedFat', 'notes'],
            },
          },
        },
        required: ['day', 'meals'],
      },
    },
  },
  required: ['days'],
};

export interface MealPlanLlmResult {
  days: Array<{
    day: number;
    meals: Array<{
      mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
      foodItemId: number | null;
      foodName: string;
      quantity: number;
      servingSize: string;
      servingUnit: string;
      estimatedCalories: number;
      estimatedProtein: number;
      estimatedCarbs: number;
      estimatedFat: number;
      notes: string | null;
    }>;
  }>;
}
