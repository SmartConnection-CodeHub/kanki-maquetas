var SUPABASE_URL = 'https://yjjtbwfgtoepsevvkzta.supabase.co'
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqanRid2ZndG9lcHNldnZrenRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMzMwMDQsImV4cCI6MjA4OTYwOTAwNH0.sSYTud8avaGh7Ik2fx9FWQUHTUct5C14uqNqQeb7yvU'
var EDGE_FUNCTION_URL = SUPABASE_URL + '/functions/v1'
var _supabaseLib = window.supabase
var supabase = null
try {
  if (_supabaseLib && _supabaseLib.createClient) supabase = _supabaseLib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
} catch(e) { console.warn('Supabase init skipped:', e.message) }
