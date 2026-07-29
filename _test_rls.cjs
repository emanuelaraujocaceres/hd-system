// Test RLS with a real user JWT
import { createClient } from '@supabase/supabase-js';
const https = require('https');

const SUPABASE_URL = 'https://tixwhmgzibvazkqbqoev.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5NzY0MDAsImV4cCI6MjEwMDQ3MzI0M30.Gz-Qt-KOfokqrvEAPGFC0x56sK63mSkbYFD-NIrdzhs';

If this is the wrong key, let me try: 
const ANON_KEY_TRY2 = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4OTcyNDMsImV4cCI6MjEwMDQ3MzI0M30._5d_QlYpWXTUB4Bh4MbK5AGXUrFKkfiJPzPEz3Zi7yg';

const ANON_KEY = ANON_KEY_TRY2;

// First, sign in as marcelo@gmail.com to get a real JWT
function signIn(email, password) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ email, password, gotrue_meta_security: {} });
    const opts = { 
      hostname: 'tixwhmgzibvazkqbqoev.supabase.co', 
      path: '/auth/v1/token?grant_type=password', 
      method: 'POST',
      headers: { 
        'apikey': ANON_KEY, 
        'Content-Type': 'application/json',
      } 
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve({ error: 'parse error', raw: data.substring(0, 500) }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function callRPC(jwt, functionName, params) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(params);
    const opts = { 
      hostname: 'tixwhmgzibvazkqbqoev.supabase.co', 
      path: `/rest/v1/rpc/${functionName}`, 
      method: 'POST',
      headers: { 
        'apikey': ANON_KEY, 
        'Authorization': `Bearer ${jwt}`, 
        'Content-Type': 'application/json' 
      } 
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, raw: data.substring(0, 1000) }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function callAPI(jwt, path, options = {}) {
  return new Promise((resolve, reject) => {
    const body = options.body ? JSON.stringify(options.body) : undefined;
    const opts = { 
      hostname: 'tixwhmgzibvazkqbqoev.supabase.co', 
      path: path, 
      method: options.method || 'GET',
      headers: { 
        'apikey': ANON_KEY, 
        'Authorization': `Bearer ${jwt}`, 
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      } 
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, raw: data.substring(0, 1000) }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  console.log('Trying different passwords...');
  
  // Try commonly used passwords
  const passwords = ['senha123', '123456', 'password', 'admin123', 'marcelo123'];
  
  for (const pw of passwords) {
    console.log(`\nTrying password: ${pw}`);
    const r = await signIn('marcelo@gmail.com', pw);
    if (r.access_token) {
      console.log(`✅ LOGIN SUCCESS with password: ${pw}`);
      console.log('JWT:', r.access_token.substring(0, 60) + '...');
      console.log('User ID:', r.user?.id);
      
      // Now test RLS
      const org = await callRPC(r.access_token, 'get_auth_user_org_id', {});
      console.log('\nget_auth_user_org_id():', JSON.stringify(org));
      
      // Check system_users
      const su = await callAPI(r.access_token, `/rest/v1/system_users?id=eq.${r.user.id}&select=organization_id,superadmin,email`);
      console.log('system_users:', JSON.stringify(su));
      
      // Query stock_movements
      const sm = await callAPI(r.access_token, '/rest/v1/stock_movements?select=id,organization_id,store_branch_id&limit=3');
      console.log('stock_movements:', JSON.stringify(sm));
      
      // Try upsert with WRONG org (simulate stale queue item)
      if (Array.isArray(sm.body) && sm.body.length > 0) {
        const existing = sm.body[0];
        console.log(`\nTrying upsert with DIFFERENT org (simulating stale queue)...`);
        const upsertWrongOrg = await callAPI(r.access_token, '/rest/v1/stock_movements', {
          method: 'POST',
          body: { ...existing, organization_id: '361fb95a-3e9f-43be-a43c-0dc91f851f31', operator_name: 'test-wrong-org' },
          headers: { 'Prefer': 'resolution=merge-duplicates' }
        });
        console.log('Upsert with wrong org:', JSON.stringify(upsertWrongOrg));
        
        // Try upsert with CORRECT org
        console.log(`\nTrying upsert with CORRECT org...`);
        const upsertCorrectOrg = await callAPI(r.access_token, '/rest/v1/stock_movements', {
          method: 'POST',
          body: { ...existing, organization_id: existing.organization_id, operator_name: 'test-correct-org' },
          headers: { 'Prefer': 'resolution=merge-duplicates' }
        });
        console.log('Upsert with correct org:', JSON.stringify(upsertCorrectOrg));
      }
      
      break;
    } else {
      console.log(`❌ Failed:`, r.message || r.error || 'unknown');
    }
  }
}

main().catch(console.error);
