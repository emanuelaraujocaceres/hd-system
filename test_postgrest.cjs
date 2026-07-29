const https = require('https');

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHsobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4OTcyNDMsImV4cCI6MjEwMDQ3MzI0M30._5d_QlYpWXTUB4Bh4MbK5AGXUrFKkfiJPzPEz3Zi7yg';

// Test using the postgrest endpoint which is more commonly available
async function testPostgrest() {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      name: 'test_table',
      columns: 'id uuid primary key default gen_random_uuid(), organization_id uuid, test_value text'
    });
    const opts = {
      hostname: 'tixwhmgzibvazkqbqoev.supabase.co',
      path: '/rest/v1/tables',
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': 'Bearer ' + ANON_KEY,
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
  console.log('🔄 Testing PostgREST table creation...');
  
  const result = await testPostgrest();
  console.log('Status:', result.status);
  console.log('Headers:', JSON.stringify(result.headers, null, 2));
  console.log('Body:', result.body);
}

main().catch(console.error);
