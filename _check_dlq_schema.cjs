const https = require('https');
const SRK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDg5NzI0MywiZXhwIjoyMTAwNDczMjQzfQ.j6FXodPl_xduyq_w_laaZEPE456hj_UxMcEqLevt2N0';

// Get OpenAPI schema  
const opts = { hostname: 'tixwhmgzibvazkqbqoev.supabase.co', path: '/rest/v1/', method: 'GET',
  headers: { 'apikey': SRK, 'Authorization': 'Bearer ' + SRK } };
const req = https.request(opts, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const api = JSON.parse(data);
    const defs = api.definitions || {};
    const dlq = defs['movimentacoes_falhas'] || defs['MovimentacoesFalhas'] || {};
    const props = dlq.properties || {};
    console.log('movimentacoes_falhas columns:');
    Object.entries(props).forEach(([name, info]) => {
      console.log(`  ${name}: type=${info.type}, format=${info.format}, default=${info.default}`);
    });
  });
});
req.end();
