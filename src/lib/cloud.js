import { API_BASE, supabase } from './supabase';

async function callApi(path, body) {
  const response = await fetch(`${API_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    throw new Error(`The helper service replied ${response.status} with a non-JSON body.`);
  }

  if (!response.ok || data.status === 'error' || data.status === 'unavailable') {
    throw new Error(data.message || `The helper service replied ${response.status}.`);
  }
  return data;
}

export const askAboutPdf = (question, passages) => callApi('answer', { question, passages });

export const translateText = (text, target) => callApi('translate', { text, target });

export const buildFlowchart = (code) => callApi('flowchart', { code });

export async function recordLogin(userId, email) {
  if (!supabase) return;
  const { error } = await supabase.from('studymate_logins').insert({ user_id: userId, email });
  if (error) console.error('Failed to record sign-in', error.message);
}

export async function fetchLoginHistory(userId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('studymate_logins')
    .select('email, logged_at')
    .eq('user_id', userId)
    .order('logged_at', { ascending: false })
    .limit(25);
  if (error) {
    console.error('Failed to load sign-in history', error.message);
    return [];
  }
  return data ?? [];
}

export async function saveQuestion(entry) {
  if (!supabase) return;
  const { error } = await supabase.from('studymate_questions').insert(entry);
  if (error) {
    console.error('Failed to save the question', error.message);
    // Generic wording: the raw Postgres message names tables and policies.
    throw new Error('This answer is shown, but it was not added to your question history.');
  }
}

export async function fetchQuestions(userId, limit = 15) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('studymate_questions')
    .select('question, answer, mode, sources, asked_at')
    .eq('user_id', userId)
    .order('asked_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('Failed to load saved questions', error.message);
    return [];
  }
  return data ?? [];
}
