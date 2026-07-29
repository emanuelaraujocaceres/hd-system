const https = require('https');

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4OTcyNDMsImV4cCI6MjEwMDQ3MzI0M30._5d_QlYpWXTUB4Bh4MbK5AGXUrFKkfiJPzPEz3Zi7yg';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MjEwMDQ3MzI0M30.j6FXodPl_xduyq_w_laaZEPE456hj_UxMcEqLevt2N0';

// Try to post a simple statement first to test auth
async function testAuth() {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: 'SELECT 1 as test' });
    const opts = {
      hostname: 'tixwhmgzibvazkqbqoev.supabase.co',
      path: '/rest/v1/rpc/run_sql',
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': 'Bearer ' + SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ 
          status: res.statusCode, 
          body: data,
          headers: res.headers
        });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('🔄 Testing SQL authentication...');
  
  const result = await testAuth();
  console.log('Status:', result.status);
  console.log('Headers:', JSON.stringify(result.headers, null, 2));
  console.log('Body:', result.body);
  
  if (result.status === 401) {
    console.log('\n❌ Authentication failed! Service role key may be invalid.');
    console.log('Available keys in .env.local:')
    console.log('- VITE_SUPABASE_ANON_KEY (anon key)')
    console.log('- SUPABASE_SERVICE_ROLE_KEY (service role key)');
    
    // Try with anon key
    console.log('\n🔄 Trying with anon key...');
    const body2 = JSON.stringify({ query: 'SELECT 1 as test' });
    const opts2 = {
      hostname: 'tixwhmgzibvazkqbqoev.supabase.co',
      path: '/rest/v1/rpc/run_sql',
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': 'Bearer ' + ANON_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    };
    const req2 = https.request(opts2, res2 => {
      let data2 = '';
      res2.on('data', chunk => data2 += chunk);
      res2.on('end', () => {
        console.log('Anon key Status:', res2.statusCode);
        console.log('Anon key Body:', data2);
      });
    });
    req2.on('error', err => console.error('Anon key error:', err));
    req2.write(body2);
    req2.end();
  }
}

main().catch(console.error);
