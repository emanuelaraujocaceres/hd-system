const fs=require('fs'),path=require('path');
const e={};fs.readFileSync('.env.local','utf8').split('\n').forEach(l=>{const m=l.match(/^([A-Z_]+)="?([^"]*)"?$/);if(m)e[m[1]]=m[2].trim();});
const {createClient}=require(path.join(process.cwd(),'node_modules','@supabase','supabase-js'));
const s=createClient(e.VITE_SUPABASE_URL,e.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
  // 1) Policies existentes
  const r=await s.rpc('exec_sql',{q:"SELECT policyname, tablename, qual FROM pg_policies WHERE schemaname='public' ORDER BY tablename"});
  console.log('=== POLICIES ===');
  console.log(JSON.stringify(r.data,null,2));
  // 2) Colunas de system_users pra ver se tem organization_id/store_branch_id
  const c=await s.rpc('exec_sql',{q:"SELECT column_name, data_type FROM information_schema.columns WHERE table_name='system_users' AND column_name IN ('organization_id','store_branch_id','role')"});
  console.log('\n=== system_users cols ===');
  console.log(JSON.stringify(c.data,null,2));
  // 3) Verificar se existe app.jwt_secret ou custom claims
  const j=await s.rpc('exec_sql',{q:"SELECT key, value FROM auth.configs WHERE key LIKE '%jwt%' LIMIT 10"});
  console.log('\n=== auth configs ===');
  console.log(JSON.stringify(j.data,null,2));
})().catch(x=>console.error('ERR',x.message));
