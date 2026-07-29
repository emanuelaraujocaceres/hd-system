const https = require('https');
const SRK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDg5NzI0MywiZXhwIjoyMTAwNDczMjQzfQ.j6FXodPl_xduyq_w_laaZEPE456hj_UxMcEqLevt2N0';

function runSQL(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const opts = { 
      hostname: 'tixwhmgzibvazkqbqoev.supabase.co', 
      path: '/rest/v1/rpc/run_sql', 
      method: 'POST',
      headers: { 
        'apikey': SRK, 
        'Authorization': 'Bearer ' + SRK, 
        'Content-Type': 'application/json' 
      } 
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data.substring(0, 2000) }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  // Try the SQL endpoint
  console.log('Testing run_sql endpoint...');
  const r1 = await runSQL('SELECT 1 as test');
  console.log('Result:', JSON.stringify(r1));
  
  // Try another approach - query via pg_catalog
  console.log('\nTrying SQL query via pg_catalog...');
  const r2 = await runSQL('SELECT column_name FROM information_schema.columns WHERE table_name = \'movimentacoes_falhas\' ORDER BY ordinal_position');
  console.log('Result:', JSON.stringify(r2));
}

main().catch(console.error);
