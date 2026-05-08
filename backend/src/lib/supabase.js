const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

// Service role client — full DB access, only used server-side
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws },
  }
);

module.exports = supabase;
