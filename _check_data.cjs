const https = require('https');
const SRK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDg5NzI0MywiZXhwIjoyMTAwNDczMjQzfQ.j6FXodPl_xduyq_w_laaZEPE456hj_UxMcEqLevt2N0';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4OTcyNDMsImV4cCI6MjEwMDQ3MzI0M30._5d_QlYpWXTUB4Bh4MbK5AGXUrFKkfiJPzPEz3Zi7yg';

function callAPI(path, jwt) {
  return new Promise((resolve, reject) => {
    const opts = { 
      hostname: 'tixwhmgzibvazkqbqoev.supabase.co', 
      path: path, 
      method: 'GET',
      headers: { 'apikey': jwt === SRK ? SRK : ANON, 'Authorization': `Bearer ${jwt}` } 
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve({ raw: data.substring(0, 2000) }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  // Use service_role (bypasses RLS) to query system_users
  const systemUsers = await callAPI('/rest/v1/system_users?select=id,email,organization_id,superadmin,store_branch_id', SRK);
  console.log('=== SYSTEM_USERS ===');
  console.log(JSON.stringify(systemUsers, null, 2));
  
  // Check stock_movements
  const stockMvts = await callAPI('/rest/v1/stock_movements?select=id,organization_id,store_branch_id,product_name&limit=5', SRK);
  console.log('\n=== STOCK_MOVEMENTS (first 5) ===');
  console.log(JSON.stringify(stockMvts, null, 2));
  
  // Count stock_movements
  const smCount = await callAPI('/rest/v1/stock_movements?select=id&limit=1000', SRK);
  console.log(`\nTotal stock_movements: ${Array.isArray(smCount) ? smCount.length : smCount.raw?.length || '?'}`);
  
  // Check stock movements by org
  const smByOrg = await callAPI('/rest/v1/stock_movements?select=organization_id,count=organization_id&order=organization_id', SRK);
  console.log('\nStock movements by org:');
  if (Array.isArray(smByOrg)) {
    const counts = {};
    smByOrg.forEach(sm => { counts[sm.organization_id] = (counts[sm.organization_id] || 0) + 1; });
    Object.entries(counts).forEach(([org, count]) => console.log(`  ${org}: ${count}`));
  }
  
  // Check cash_sessions
  const cs = await callAPI('/rest/v1/cash_sessions?select=id,organization_id,user_id,store_branch_id&limit=5', SRK);
  console.log('\n=== CASH_SESSIONS (first 5) ===');
  console.log(JSON.stringify(cs, null, 2));
}

main().catch(console.error);
