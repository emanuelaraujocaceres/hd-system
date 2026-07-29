const https = require('https');

// Test different API key formats
async function testKey(key, keyName) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ test: 'ping' });
    const opts = {
      hostname: 'tixwhmgzibvazkqbqoev.supabase.co',
      path: '/rest/v1/',
      method: 'GET',
      headers: {
        'apikey': key,
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json',
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
  console.log('🔄 Testing different API key formats...');
  
  const testKeys = [
    {
      name: 'ANON_KEY from .env.local',
      key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHBobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4OTcyNDMsImV4cCI6MjEwMDQ3MzI0M30._5d_QlYpWXTUB4Bh4MbK5AGXUrFKkfiJPzPEz3Zi7yg'
    },
    {
      name: 'SERVICE_ROLE_KEY from .env.local',
      key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHBobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MjEwMDQ3MzI0M30.j6FXodPl_xduyq_w_laaZEPE456hj_UxMcEqLevt2N0'
    },
    {
      name: 'Sliced SERVICE_ROLE_KEY (from backup)',
      key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHBobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MjEwMDQ3MzI0M30.j6FXodPl_xduyq_w_laaZEPE456hj_UxMcEqLevt2N0'
    }
  ];
  
  for (const test of testKeys) {
    console.log(`\n--- Testing ${test.name} ---`);
    try {
      const result = await testKey(test.key, test.name);
      console.log(`Status: ${result.status}`);
      if (result.status !== 401 && result.status !== 200) {
        console.log('Body:', result.body.substring(0, 1000));
      }
    } catch (error) {
      console.error('Error:', error.message);
    }
  }
}

main().catch(console.error);
