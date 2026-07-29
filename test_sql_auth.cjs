const https = require('https');

const SRK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MjEwMDQ3MzI0M30._5d_QlYpWXTUB4Bh4MbK5AGXUrFKkfiJPzPEz3Zi7yg';

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

async function executeScript() {
  try {
    const fs = require('fs');
    const sqlPath = __dirname + '/AddUserPermissions.sql';
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('🔄 Executing AddUserPermissions.sql...');
    console.log('SQL length:', sqlContent.length, 'characters');
    
    // Try first few statements to understand the 401 issue
    const testStatements = sqlContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt && !stmt.startsWith('--'))
      .slice(0, 5);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < testStatements.length; i++) {
      const stmt = testStatements[i];
      console.log(`\n--- Testing statement ${i + 1} ---`);
      console.log('Statement:', stmt.substring(0, 200) + '...');
      
      try {
        const result = await runSQL(stmt);
        console.log('Status:', result.status);
        console.log('Headers:', JSON.stringify(result.headers, null, 2));
        console.log('Body:', result.body.substring(0, 1000));
        successCount++;
      } catch (error) {
        console.error('Error:', error.message);
        errorCount++;
      }
    }
    
  } catch (error) {
    console.error('💥 Script execution failed:', error.message);
    process.exit(1);
  }
}

executeScript().catch(console.error);
