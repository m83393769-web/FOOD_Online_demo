// =======================================================
// ПОДКЛЮЧЕНИЕ К SUPABASE
// =======================================================

const SUPABASE_URL = 'https://piydhopdtderqbqjrwlh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpeWRob3BkdGRlcnFicWpyd2xoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODc1NjgsImV4cCI6MjA4NzM2MzU2OH0.PCneHkgVleoL6JP1AFKF9B4izhKqtTh2vTgjGmJ7bP8';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);