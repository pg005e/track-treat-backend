import { AdaptiveProfile } from 'src/adaptive/adaptive-profile';

export interface WeeklyFeedbackContext {
  dietaryGoal: string;
  targetCalories: number;
  dietaryLifestyle: string;
  currentWeight: number | null;
  days: Array<{
    date: string;
    consumed: number;
    target: number;
    delta: number;
  }>;
  summary: {
    totalConsumed: number;
    avgDaily: number;
    weeklyTarget: number;
    daysOnTrack: number;
    daysLogged: number;
  };
  adherenceScores?: number[];
  adaptiveProfile?: AdaptiveProfile | null;
}

// Tone by strictness (the algorithm decides, not the LLM)
const TONE_BY_STRICTNESS: Record<string, string> = {
  strict: 'Direct and specific. Name what needs to change. Higher expectations.',
  moderate: 'Honest and warm. Balance acknowledgment with direction.',
  lenient: 'Encouraging. Lead with what went right. Celebrate effort.',
};

// Guidance by quadrant
const GUIDANCE_BY_QUADRANT: Record<string, string> = {
  ideal: 'Celebratory. Raise the bar slightly. User is performing well.',
  plan_wrong: 'Reassuring. The plan is being fixed, not the user. Acknowledge their discipline.',
  self_directed: 'Respectful of autonomy. Offer suggestions not instructions. User is capable.',
  struggling: 'Protective of motivation. Focus on one small achievable win for next week.',
};

export function buildWeeklyFeedbackPrompt(ctx: WeeklyFeedbackContext) {
  const dayBreakdown = ctx.days
    .map(
      (d) =>
        `  ${d.date}: ${d.consumed}cal (target:${d.target}, delta:${d.delta > 0 ? '+' : ''}${d.delta})`,
    )
    .join('\n');

  const ap = ctx.adaptiveProfile;
  const toneInstruction = ap
    ? `TONE: ${TONE_BY_STRICTNESS[ap.strictnessLevel] || TONE_BY_STRICTNESS.moderate}\nGUIDANCE: ${GUIDANCE_BY_QUADRANT[ap.quadrant] || GUIDANCE_BY_QUADRANT.ideal}`
    : 'TONE: Encouraging but honest. Focus on patterns not individual days.';

  const adaptiveContext = ap
    ? `\nAdaptive: quadrant=${ap.quadrant}, strictness=${ap.strictnessLevel}, outcomeScore=${ap.outcomeScore.toFixed(2)}, adherenceScore=${ap.adherenceScore.toFixed(2)}, pressureScore=${Math.round(ap.pressureScore)}, streak=${ap.weekStreak}wk.`
    : '';

  return {
    system: `Nutrition coach. ${toneInstruction} Actionable, data-specific observations. Under 200 words.

User: goal=${ctx.dietaryGoal}, target=${ctx.targetCalories}cal/day, lifestyle=${ctx.dietaryLifestyle}${ctx.currentWeight ? `, weight=${ctx.currentWeight}kg` : ''}.${adaptiveContext}`,

    user: `Weekly data:\n${dayBreakdown}\n\nLogged: ${ctx.summary.daysLogged}/7. On track (±10%): ${ctx.summary.daysOnTrack}/7. Avg: ${ctx.summary.avgDaily}cal. Total: ${ctx.summary.totalConsumed}/${ctx.summary.weeklyTarget}cal.${ctx.adherenceScores ? ` Adherence: ${ctx.adherenceScores.join(', ')}.` : ''}`,
  };
}

export const weeklyFeedbackToolName = 'provide_weekly_feedback';

export const weeklyFeedbackToolDescription = 'Weekly nutrition feedback';

export const weeklyFeedbackSchema = {
  type: 'object' as const,
  properties: {
    overallRating: { type: 'string', enum: ['excellent', 'good', 'needs_improvement', 'poor'] },
    summary: { type: 'string' },
    observations: { type: 'array', items: { type: 'string' } },
    tip: { type: 'string' },
    encouragement: { type: 'string' },
  },
  required: ['overallRating', 'summary', 'observations', 'tip', 'encouragement'],
};

export interface WeeklyFeedbackResult {
  overallRating: 'excellent' | 'good' | 'needs_improvement' | 'poor';
  summary: string;
  observations: string[];
  tip: string;
  encouragement: string;
}
