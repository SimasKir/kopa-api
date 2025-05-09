const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase configuration missing. Check .env variables.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;