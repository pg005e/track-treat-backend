export interface ParsedFoodItem {
  name: string;
  quantity: number;
  unit: string | null; // "g", "ml", "cup", "bowl", "plate", "piece", null (count)
}

// Words that are not food items
const STOP_WORDS = new Set([
  'had', 'ate', 'eaten', 'having', 'eating', 'some', 'with', 'the',
  'for', 'about', 'roughly', 'around', 'maybe', 'like', 'just',
  'also', 'then', 'plus', 'extra', 'little', 'bit', 'lot', 'lots',
  'today', 'yesterday', 'morning', 'afternoon', 'evening', 'night',
  'breakfast', 'lunch', 'dinner', 'snack', 'meal',
]);

// Spelled-out numbers
const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  half: 0.5, quarter: 0.25,
};

// Recognized units
const UNITS = new Set([
  'g', 'gm', 'gms', 'gram', 'grams',
  'kg', 'kgs', 'kilogram', 'kilograms',
  'ml', 'milliliter', 'milliliters',
  'l', 'liter', 'liters', 'litre', 'litres',
  'oz', 'ounce', 'ounces',
  'cup', 'cups',
  'bowl', 'bowls',
  'plate', 'plates',
  'piece', 'pieces', 'pcs',
  'slice', 'slices',
  'tbsp', 'tablespoon', 'tablespoons',
  'tsp', 'teaspoon', 'teaspoons',
  'scoop', 'scoops',
  'serving', 'servings',
  'glass', 'glasses',
  'bottle', 'bottles',
  'pack', 'packs', 'packet', 'packets',
]);

// Normalize units to a canonical form
const UNIT_MAP: Record<string, string> = {
  g: 'g', gm: 'g', gms: 'g', gram: 'g', grams: 'g',
  kg: 'kg', kgs: 'kg', kilogram: 'kg', kilograms: 'kg',
  ml: 'ml', milliliter: 'ml', milliliters: 'ml',
  l: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  cup: 'cup', cups: 'cup',
  bowl: 'bowl', bowls: 'bowl',
  plate: 'plate', plates: 'plate',
  piece: 'piece', pieces: 'piece', pcs: 'piece',
  slice: 'slice', slices: 'slice',
  tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  scoop: 'scoop', scoops: 'scoop',
  serving: 'serving', servings: 'serving',
  glass: 'glass', glasses: 'glass',
  bottle: 'bottle', bottles: 'bottle',
  pack: 'pack', packs: 'pack', packet: 'pack', packets: 'pack',
};

/**
 * Parse free-form text like "2 eggs and 300g rice" into structured items.
 *
 * Supported patterns:
 *   "2 eggs"           → { name: "eggs", quantity: 2, unit: null }
 *   "300g chicken"     → { name: "chicken", quantity: 300, unit: "g" }
 *   "a bowl of daal"   → { name: "daal", quantity: 1, unit: "bowl" }
 *   "rice, daal, roti" → three items, quantity 1 each
 */
export function parseFoodText(text: string): ParsedFoodItem[] {
  // Normalize
  const cleaned = text
    .toLowerCase()
    .replace(/[.!?;]+/g, ',') // punctuation → comma
    .replace(/\band\b/g, ',') // "and" → comma
    .replace(/\bwith\b/g, ',')
    .replace(/\bplus\b/g, ',')
    .replace(/\balso\b/g, ',');

  // Split into segments on commas
  const segments = cleaned
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const results: ParsedFoodItem[] = [];

  for (const segment of segments) {
    const parsed = parseSegment(segment);
    if (parsed) {
      results.push(parsed);
    }
  }

  return results;
}

function parseSegment(segment: string): ParsedFoodItem | null {
  const tokens = segment.split(/\s+/);

  let quantity = 1;
  let unit: string | null = null;
  let nameStart = 0;

  // Try to extract leading quantity: "2", "300g", "a", "two"
  if (tokens.length > 0) {
    const first = tokens[0];

    // Check "300g" pattern (number+unit glued together)
    const gluedMatch = first.match(/^(\d+(?:\.\d+)?)(g|gm|kg|ml|oz|l)$/);
    if (gluedMatch) {
      quantity = parseFloat(gluedMatch[1]);
      unit = UNIT_MAP[gluedMatch[2]] || gluedMatch[2];
      nameStart = 1;
    }
    // Check numeric: "2", "1.5"
    else if (/^\d+(\.\d+)?$/.test(first)) {
      quantity = parseFloat(first);
      nameStart = 1;

      // Check if next token is a unit
      if (tokens.length > 1 && UNITS.has(tokens[1])) {
        unit = UNIT_MAP[tokens[1]] || tokens[1];
        nameStart = 2;
      }
    }
    // Check word number: "a", "two", "half"
    else if (first in WORD_NUMBERS) {
      quantity = WORD_NUMBERS[first];
      nameStart = 1;

      // Check if next token is a unit
      if (tokens.length > 1 && UNITS.has(tokens[1])) {
        unit = UNIT_MAP[tokens[1]] || tokens[1];
        nameStart = 2;
      }
    }
  }

  // Everything after quantity+unit is the food name
  const nameTokens = tokens
    .slice(nameStart)
    .filter((t) => !STOP_WORDS.has(t) && t !== 'of');

  const name = nameTokens.join(' ').trim();

  if (!name) return null;

  return { name, quantity, unit };
}
