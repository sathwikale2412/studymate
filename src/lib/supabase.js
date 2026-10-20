import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = url && anonKey ? createClient(url, anonKey) : null;

export const API_BASE = import.meta.env.VITE_API_BASE || '/api';
