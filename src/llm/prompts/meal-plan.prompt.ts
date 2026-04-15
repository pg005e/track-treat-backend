import { AdaptiveProfile } from 'src/adaptive/adaptive-profile';

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
    protein: number;
    carbs: number;
    fat: number;
    category: string | null;
  }>;
  adaptiveProfile?: AdaptiveProfile | null; // null on initial generation
}

export function buildMealPlanPrompt(ctx: MealPlanContext) {
  // ── Food catalog encoding ──────────────────────────────────────────────
  // Format: id:name:kcal:p:c:f  (protein/carb/fat in grams)
  // Pre-filtered before this call: allergens removed, region-filtered,
  // budget-filtered, capped at 80 items by affinity score.
  const foodList = ctx.availableFoods
    .map(
      (f) => `${f.id}:${f.name}:${f.calories}:${f.protein}:${f.carbs}:${f.fat}`,
    )
    .join('|');

  // ── Hard constraints ───────────────────────────────────────────────────
  const constraints: string[] = [];
  if (ctx.dietaryLifestyle && ctx.dietaryLifestyle !== 'none') {
    constraints.push(`lifestyle:${ctx.dietaryLifestyle}`);
  }
  if (ctx.allergies.length > 0) {
    constraints.push(`ALLERGIES(never include):${ctx.allergies.join(',')}`);
  }
  if (ctx.restrictions.length > 0) {
    constraints.push(`restrictions:${ctx.restrictions.join(',')}`);
  }
  if (ctx.dislikes.length > 0) {
    constraints.push(`avoid:${ctx.dislikes.join(',')}`);
  }
  if (ctx.budgetPerDay) {
    constraints.push(`budget:${ctx.budgetPerDay}/day`);
  }

  // ── Adaptive constraints (recalibration runs only) ─────────────────────
  const adaptiveConstraints = buildAdaptiveConstraints(ctx.adaptiveProfile);

  // ── Region instruction ─────────────────────────────────────────────────
  const regionInstruction = ctx.region
    ? `Region: ${ctx.region}. Every recipe must use ingredients commonly sold at local markets in ${ctx.region}. No imported specialty items.`
    : '';

  // ── System prompt ──────────────────────────────────────────────────────
  const system = [
    `You are a meal planning assistant. You MUST respond ONLY by calling the create_meal_plan function. Do NOT output text, explanations, ingredient lists, or questions. Generate a 7-day recipe-based meal plan.`,

    `TARGET: ${ctx.targetCalories} kcal/day (±10%). ${ctx.mealsPerDay} meals/day: ${getMealTypeDistribution(ctx.mealsPerDay)}. That is ~${Math.round(ctx.targetCalories / ctx.mealsPerDay)} kcal per meal. Each recipe's ingredients (sum of estimatedCalories × quantity) MUST add up to roughly this per-meal target.`,

    regionInstruction,

    `FOOD RULES:
- Whole, minimally processed, home-cookable ingredients only.
- Allowed: vegetables, fruits, whole grains, legumes, lentils, lean meat, eggs, dairy, nuts, seeds, cold-pressed oils.
- Forbidden: packaged snacks, instant noodles, chips, soda, candy, fast food, processed meats, deep-fried takeaway.`,

    `RECIPE RULES:
- Each meal: a named recipe with prepNotes (2–3 steps) and an ingredient list.
- servingSize defines ONE serving as a numeric string (e.g. "150"), servingUnit is the unit (prefer "g" or "ml").
- quantity is a MULTIPLIER of servingSize (1 = one serving, 1.5 = one and a half servings, 2 = two servings). It is NOT the absolute weight. Typical range: 0.5–3.
- estimatedCalories/Protein/Carbs/Fat are the macros for ONE serving (the servingSize amount), NOT multiplied by quantity.
- CRITICAL: The total daily calories (sum of estimatedCalories × quantity for all ingredients) MUST be within ±10% of the target. Verify before outputting.
- No allergen ingredients ever. No same recipe on consecutive days.
- Vary cooking methods across the week (boil, sauté, steam, roast, raw).
- Use foodItemId from the catalog when the ingredient matches. Set foodItemId=null for unlisted ingredients.`,

    constraints.length > 0 ? `CONSTRAINTS: ${constraints.join(' | ')}` : '',

    adaptiveConstraints.length > 0
      ? `ADAPTIVE: ${adaptiveConstraints.join(' | ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  // ── User prompt ────────────────────────────────────────────────────────
  // Format: id:name:kcal:protein:carbs:fat
  const user = foodList
    ? `Ingredient catalog (id:name:kcal:p:c:f):\n${foodList}`
    : `No ingredient catalog available. Use common whole foods typical of ${ctx.region ?? "the user's region"} and provide estimated macros for each ingredient.`;

  return { system, user };
}

// ── Adaptive constraint builder ────────────────────────────────────────────
// Serialises AdaptiveProfile into terse prompt instructions.
// Called only on recalibration runs (week 2+).
function buildAdaptiveConstraints(profile?: AdaptiveProfile | null): string[] {
  if (!profile) return [];

  const c: string[] = [];

  // Complexity
  c.push(`complexity:${profile.complexityTarget}/10`);
  if (profile.complexityTarget <= 3) {
    c.push(
      'max 5 ingredients per recipe|prep under 20 min|familiar staple ingredients only',
    );
  } else if (profile.complexityTarget <= 6) {
    c.push('moderate variety|max 1 unfamiliar ingredient per day');
  } else {
    c.push('varied techniques and ingredients welcome|longer prep acceptable');
  }

  // Plan mode
  if (profile.planMode === 'prescriptive') {
    c.push('be precise with portions — user follows the plan closely');
  } else if (profile.planMode === 'flexible') {
    c.push('include a simpler swap option in prepNotes for each meal');
  } else {
    c.push(
      "suggestive mode — frame recipes as ideas, note why each fits the user's goals",
    );
  }

  // Recalibration ramp
  if (profile.recalibrateFlag) {
    c.push(
      'calorie targets just changed — ramp into new target across days 1–3, do not jump immediately',
    );
  }

  // Quadrant-specific instructions
  if (profile.quadrant === 'struggling') {
    c.push(
      "prioritise familiar comfort foods from the user's region|avoid new cuisines or techniques this week",
    );
  }
  if (profile.quadrant === 'plan_wrong') {
    c.push(
      "rebuild from scratch with corrected targets|do not repeat last week's meal structure",
    );
  }
  if (profile.quadrant === 'ideal') {
    c.push(
      'introduce one new ingredient or technique per day to maintain engagement',
    );
  }

  // Food preferences from behavioral signals
  if (profile.skippedFoods.length > 0) {
    c.push(`exclude food IDs (user skips these): ${profile.skippedFoods.join(',')}`);
  }
  if (profile.preferredFoods.length > 0) {
    c.push(`prioritize food IDs (user prefers): ${profile.preferredFoods.join(',')}`);
  }

  // Slot adherence — drop slots the user never fills
  if (profile.slotAdherence) {
    const droppedSlots = Object.entries(profile.slotAdherence)
      .filter(([, score]) => score < 0.2)
      .map(([slot]) => slot);
    if (droppedSlots.length > 0) {
      c.push(`skip these meal slots (user never fills them): ${droppedSlots.join(',')}`);
    }
  }

  return c;
}

// ── Meal type distribution ─────────────────────────────────────────────────
function getMealTypeDistribution(mealsPerDay: number): string {
  if (mealsPerDay <= 2) return 'lunch, dinner';
  if (mealsPerDay === 3) return 'breakfast, lunch, dinner';
  if (mealsPerDay === 4) return 'breakfast, lunch, snack, dinner';
  if (mealsPerDay === 5) return 'breakfast, snack, lunch, snack, dinner';
  return 'breakfast, snack, lunch, snack, dinner, snack';
}

// ── Tool definition ────────────────────────────────────────────────────────
export const mealPlanToolName = 'create_meal_plan';
export const mealPlanToolDescription =
  '7-day recipe-based meal plan with ingredients and prep notes';

export const mealPlanSchema = {
  type: 'object' as const,
  properties: {
    days: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          day: { type: 'integer' },
          recipes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                mealType: {
                  type: 'string',
                  enum: ['breakfast', 'lunch', 'dinner', 'snack'],
                },
                recipeName: { type: 'string' },
                prepNotes: { type: ['string', 'null'] },
                ingredients: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      foodItemId: { type: ['integer', 'null'] },
                      foodName: { type: 'string' },
                      quantity: { type: 'number' },
                      servingSize: { type: 'string' },
                      servingUnit: { type: 'string' },
                      estimatedCalories: { type: 'number' },
                      estimatedProtein: { type: 'number' },
                      estimatedCarbs: { type: 'number' },
                      estimatedFat: { type: 'number' },
                    },
                    required: [
                      'foodItemId',
                      'foodName',
                      'quantity',
                      'servingSize',
                      'servingUnit',
                      'estimatedCalories',
                      'estimatedProtein',
                      'estimatedCarbs',
                      'estimatedFat',
                    ],
                  },
                },
              },
              required: ['mealType', 'recipeName', 'prepNotes', 'ingredients'],
            },
          },
        },
        required: ['day', 'recipes'],
      },
    },
  },
  required: ['days'],
};

// ── Types ──────────────────────────────────────────────────────────────────
export interface MealPlanIngredient {
  foodItemId: number | null;
  foodName: string;
  quantity: number;
  servingSize: string;
  servingUnit: string;
  estimatedCalories: number;
  estimatedProtein: number;
  estimatedCarbs: number;
  estimatedFat: number;
}

export interface MealPlanLlmResult {
  days: Array<{
    day: number;
    recipes: Array<{
      mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
      recipeName: string;
      prepNotes: string | null;
      ingredients: MealPlanIngredient[];
    }>;
  }>;
}
