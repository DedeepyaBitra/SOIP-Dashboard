import { db, ServiceError } from './db.js';

/**
 * Asks the `ai-analyst` Supabase Edge Function (which calls Gemini server-side) to analyse a metrics summary.
 * No AI key is used or needed in the browser.
 * @param {{ scope: 'overview'|'sales'|'ops', summary: object }} input
 * @returns {Promise<{ headline, summary, findings, caveats, model, scope, generated_at }>}
 */
export async function getAiAnalysis({ scope, summary }) {
  const { data, error } = await db().functions.invoke('ai-analyst', { body: { scope, summary } });
  if (error) {
    let message = error.message || 'AI analysis failed.';
    try { const j = await error.context?.json?.(); if (j?.error) message = j.error; } catch { /* keep default message */ }
    if (error.context?.status === 404) message = 'The ai-analyst Edge Function is not deployed yet. Deploy it and set GEMINI_API_KEY (see the setup steps).';
    throw new ServiceError('ai_failed', message, error);
  }
  if (data?.error) throw new ServiceError('ai_failed', data.error);
  return data;
}