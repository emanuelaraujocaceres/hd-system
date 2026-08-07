const fs = require('fs'); const path = require('path');
const env = {}; fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n').forEach(l => { const m = l.match(/^([A-Z_]+)="?([^"]*)"?$/); if (m) env[m[1]] = m[2].trim(); });
const { createClient } = require(path.join(process.cwd(), 'node_modules', '@supabase', 'supabase-js'));
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const sm = await supabase.from('stock_movements').select('*').limit(1);
  console.log('stock_movements sample:', JSON.stringify(sm.data, null, 2));
  const sl = await supabase.from('sales').select('*').limit(1);
  console.log('\nsales sample:', JSON.stringify(sl.data, null, 2));
  const cs = await supabase.from('cash_sessions').select('*').limit(1);
  console.log('\ncash_sessions sample:', JSON.stringify(cs.data, null, 2));
})().catch(e => console.error(e.message));
