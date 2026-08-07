const fs=require('fs'),path=require('path');
const e={};fs.readFileSync('.env.local','utf8').split('\n').forEach(l=>{const m=l.match(/^([A-Z_]+)="?([^"]*)"?$/);if(m)e[m[1]]=m[2].trim();});
const {createClient}=require(path.join(process.cwd(),'node_modules','@supabase','supabase-js'));
const s=createClient(e.VITE_SUPABASE_URL,e.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
  console.log('=== LIMPEZA CORRETA (ORDEM FK) ===\n');

  // 1) Deletar TODAS as customer_sessions da org
  const {data:sess,count:beforeSess}=await s.from('customer_sessions').select('*',{count:'exact'}).eq('organization_id','361fb95a-3e9f-43be-a43c-0dc91f851f31');
  console.log('Sessoes antes:',beforeSess);
  if(beforeSess>0){
    await s.from('customer_sessions').delete().neq('id','00000000-0000-0000-0000-000000000000');
    const {count:afterSess}=await s.from('customer_sessions').select('*',{count:'exact'});
    console.log('✓ Sessoes depois:',afterSess);
  }

  // 2) Deletar TODAS as mesas da org
  const {count:beforeTables}=await s.from('tables').select('*',{count:'exact'});
  console.log('\nMesas antes:',beforeTables);
  if(beforeTables>0){
    await s.from('tables').delete().neq('id','00000000-0000-0000-0000-000000000000');
    const {count:afterTables}=await s.from('tables').select('*',{count:'exact'});
    console.log('✓ Mesas depois:',afterTables);
  }

  // 3) Criar 1 mesa nova
  const token=`mesa01-${Date.now().toString(36)}`;
  const {data:created}=await s.from('tables').insert({
    organization_id:'361fb95a-3e9f-43be-a43c-0dc91f851f31',
    store_branch_id:'e5085eba-4398-4c31-ae13-8082b46561ee',
    name:'Mesa 01',number:1,qr_token:token,status:'active'
  }).select().single();

  const {count:final}=await s.from('tables').select('*',{count:'exact'});
  console.log('\n✓ Total final no banco:',final);
  console.log('  Token:',created?.qr_token);
  console.log('  URL: https://hd-system.pages.dev/#/mesa/'+(created?.qr_token));
})().catch(x=>console.error('ERRO:',x.message));
