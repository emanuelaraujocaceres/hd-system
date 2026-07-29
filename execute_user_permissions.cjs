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

async function executeScript() {
  try {
    // Read the AddUserPermissions.sql file
    const fs = require('fs');
    const sqlPath = __dirname + '/AddUserPermissions.sql';
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('🔄 Executing AddUserPermissions.sql...');
    console.log('SQL length:', sqlContent.length, 'characters');
    
    // Split into individual statements
    const statements = sqlContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt && !stmt.startsWith('--'));
    
    console.log('Found', statements.length, 'SQL statements');
    
    // Execute in batches to handle large scripts
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      try {
        console.log(`Executing statement ${i + 1}/${statements.length}...`);
        const result = await runSQL(stmt);
        console.log(`✅ Statement ${i + 1} status: ${result.status}`);
        successCount++;
        
        // If there's a warning in the result, log it
        if (result.body && result.body.includes('WARNING')) {
          console.log('⚠️ Warning:', result.body.substring(0, 200));
        }
      } catch (error) {
        console.error(`❌ Statement ${i + 1} failed:`, error.message);
        errorCount++;
        // Continue with next statement instead of stopping
      }
    }
    
    console.log('\n📊 Execution Summary:');
    console.log('- Successful statements:', successCount);
    console.log('- Failed statements:', errorCount);
    console.log('- Total statements:', statements.length);
    
    if (errorCount > 0) {
      console.warn('⚠️ Some statements failed - check the errors above');
    } else {
      console.log('✅ All statements executed successfully!');
    }
    
  } catch (error) {
    console.error('💥 Script execution failed:', error.message);
    process.exit(1);
  }
}

executeScript().catch(console.error);
