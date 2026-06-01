const { createClient } = require('@supabase/supabase-js');
const { loadEnv } = require('./env');

loadEnv();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

function getConfigError() {
  const missing = [];
  if (!supabaseUrl) missing.push('SUPABASE_URL');
  if (!supabaseServiceKey) missing.push('SUPABASE_SERVICE_KEY atau SUPABASE_ANON_KEY');
  if (!missing.length) return null;
  return `Konfigurasi Supabase belum lengkap di server PO: ${missing.join(', ')} belum diset.`;
}

const configError = getConfigError();
if (configError) console.error(`[Supabase] ${configError}`);

const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseServiceKey || 'placeholder', {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

supabase.getConfigError = getConfigError;

module.exports = supabase;
