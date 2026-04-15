export type Quadrant =
  | 'ideal'
  | 'plan_wrong'
  | 'self_directed'
  | 'struggling';

export type StrictnessLevel = 'lenient' | 'moderate' | 'strict';

export type PlanMode = 'prescriptive' | 'flexible' | 'suggestive';

export interface AdaptiveProfile {
  // ── Core decision outputs ──────────────────────────────────────────────
  quadrant:        Quadrant;
  strictnessLevel: StrictnessLevel;
  planMode:        PlanMode;
  pressureScore:   number;      // 0–100

  // ── Plan generation directives ─────────────────────────────────────────
  complexityTarget: number;     // 1–10, fed into next plan generation prompt
  simplifyFlag:     boolean;    // true = enforce max 5 ingredients, <20 min prep
  recalibrateFlag:  boolean;    // true = recompute TDEE before next generation

  // ── Scores that produced this profile ─────────────────────────────────
  // Stored for auditability — so you can always explain why this profile
  // was produced for this user in this week.
  adherenceScore: number;       // 0–1  (A score)
  outcomeScore:   number;       // 0–1  (O score)
  weekStreak:     number;       // consecutive weeks user logged at least once
  weekNumber:     number;       // total weeks user has been active

  // ── Behavioral signals ─────────────────────────────────────────────────
  // Derived from meal_logs. Fed into plan generation as exclusions/preferences.
  skippedFoods:     number[];   // food IDs consistently skipped from plans
  preferredFoods:   number[];   // food IDs with high affinity score

  // Per-slot adherence. Used to drop slots the user never fills.
  // e.g. { breakfast: 0.2, lunch: 0.9, dinner: 0.85, snack: 0.3 }
  slotAdherence: Partial<Record<'breakfast' | 'lunch' | 'dinner' | 'snack', number>>;

  // ── Metadata ───────────────────────────────────────────────────────────
  userId:       number;
  weekStartDate: string;        // ISO date string, e.g. "2026-04-07"
  computedAt:   string;         // ISO datetime, e.g. "2026-04-14T00:05:00Z"
}

// ── Algorithm constants ────────────────────────────────────────────────────
// Centralised here so thresholds are not scattered across the codebase.
export const ADAPTIVE_THRESHOLDS = {
  A_THRESHOLD:      0.6,
  O_THRESHOLD:      0.65,
  LENIENT_MAX:      35,
  MODERATE_MAX:     65,
  WEEK_STREAK_CAP:  10,   // max weeks of streak that contributes to pressureScore
  WEEK_NUMBER_CAP:  20,   // max weekNumber that contributes to pressureScore
  MAX_COMPLEXITY:   10,
  MIN_COMPLEXITY:   1,
  MAX_COMPLEXITY_DELTA: 2, // max weekly change in complexityTarget in either direction
} as const;

// ── Algorithm implementation ───────────────────────────────────────────────
export interface AdaptiveProfileInput {
  userId:          number;
  weekStartDate:   string;
  adherenceScore:  number;
  outcomeScore:    number;
  weekStreak:      number;
  weekNumber:      number;
  baseComplexity:  number;    // previous week's avg meal complexity (1–10)
  skippedFoods:    number[];
  preferredFoods:  number[];
  slotAdherence:   Partial<Record<'breakfast' | 'lunch' | 'dinner' | 'snack', number>>;
}

export function computeAdaptiveProfile(input: AdaptiveProfileInput): AdaptiveProfile {
  const {
    userId, weekStartDate,
    adherenceScore: A, outcomeScore: O,
    weekStreak, weekNumber, baseComplexity,
    skippedFoods, preferredFoods, slotAdherence,
  } = input;

  const T = ADAPTIVE_THRESHOLDS;

  // ── Step 1: Quadrant ─────────────────────────────────────────────────
  const quadrant: Quadrant =
    A >= T.A_THRESHOLD && O >= T.O_THRESHOLD ? 'ideal'          :
    A >= T.A_THRESHOLD && O <  T.O_THRESHOLD ? 'plan_wrong'     :
    A <  T.A_THRESHOLD && O >= T.O_THRESHOLD ? 'self_directed'  :
                                               'struggling';

  // ── Step 2: Pressure score ───────────────────────────────────────────
  const pressureScore = clamp(
    A * 50 +
    O * 30 +
    Math.min(weekStreak  * 2,   T.WEEK_STREAK_CAP  * 2) +
    Math.min(weekNumber  * 0.5, T.WEEK_NUMBER_CAP  * 0.5),
    0, 100,
  );

  // ── Step 3: Strictness level ─────────────────────────────────────────
  const strictnessLevel: StrictnessLevel =
    pressureScore <= T.LENIENT_MAX  ? 'lenient'  :
    pressureScore <= T.MODERATE_MAX ? 'moderate' :
                                      'strict';

  // ── Step 4: Complexity target ────────────────────────────────────────
  const rawComplexity =
    quadrant === 'ideal'         ? baseComplexity + 1  :
    quadrant === 'struggling'    ? baseComplexity - 2  :
                                   baseComplexity;      // plan_wrong / self_directed: hold

  const complexityTarget = clamp(
    rawComplexity,
    Math.max(baseComplexity - T.MAX_COMPLEXITY_DELTA, T.MIN_COMPLEXITY),
    Math.min(baseComplexity + T.MAX_COMPLEXITY_DELTA, T.MAX_COMPLEXITY),
  );

  // ── Step 5: Flags and plan mode ──────────────────────────────────────
  const simplifyFlag    = quadrant === 'struggling' || (A < 0.4 && complexityTarget > 4);
  const recalibrateFlag = quadrant === 'plan_wrong';

  const planMode: PlanMode =
    strictnessLevel === 'strict'   ? 'prescriptive' :
    strictnessLevel === 'moderate' ? 'flexible'     :
                                     'suggestive';

  return {
    quadrant,
    strictnessLevel,
    planMode,
    pressureScore,
    complexityTarget,
    simplifyFlag,
    recalibrateFlag,
    adherenceScore:  A,
    outcomeScore:    O,
    weekStreak,
    weekNumber,
    skippedFoods,
    preferredFoods,
    slotAdherence,
    userId,
    weekStartDate,
    computedAt: new Date().toISOString(),
  };
}

// ── Utility ────────────────────────────────────────────────────────────────
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
