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
}

export function buildWeeklyFeedbackPrompt(ctx: WeeklyFeedbackContext) {
  const dayBreakdown = ctx.days
    .map(
      (d) =>
        `  ${d.date}: ${d.consumed} cal consumed (target: ${d.target}, delta: ${d.delta > 0 ? '+' : ''}${d.delta})`,
    )
    .join('\n');

  return {
    system: `Nutrition coach. Encouraging but honest. Focus on patterns not individual days. Actionable, data-specific observations. Under 200 words.

User: goal=${ctx.dietaryGoal}, target=${ctx.targetCalories} cal/day, lifestyle=${ctx.dietaryLifestyle}${ctx.currentWeight ? `, weight=${ctx.currentWeight}kg` : ''}.`,

    user: `Weekly data:\n${dayBreakdown}\n\nLogged: ${ctx.summary.daysLogged}/7. On track (±10%): ${ctx.summary.daysOnTrack}/7. Avg: ${ctx.summary.avgDaily} cal. Total: ${ctx.summary.totalConsumed}/${ctx.summary.weeklyTarget} cal.${ctx.adherenceScores ? ` Adherence: ${ctx.adherenceScores.join(', ')}.` : ''}`,
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
