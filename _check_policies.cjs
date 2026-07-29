const https = require('https');
const SRK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDg5NzI0MywiZXhwIjoyMTAwNDczMjQzfQ.j6FXodPl_xduyq_w_laaZEPE456hj_UxMcEqLevt2N0';

const sql = `
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN ('stock_movements', 'cash_sessions')
ORDER BY tablename, policyname;
`;

const body = JSON.stringify({ query: sql });
const opts = { 
  hostname: 'tixwhmgzibvazkqbqoev.supabase.co', 
  path: '/rest/v1/rpc/run_sql', 
  method: 'POST',
  headers: { 'apikey': SRK, 'Authorization': 'Bearer ' + SRK, 'Content-Type': 'application/json' } 
};
const req = https.request(opts, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Status:', res.statusCode, 'Body:', data.substring(0, 5000)));
});
req.on('error', e => console.log('Error:', e.message));
req.write(body);
req.end();
