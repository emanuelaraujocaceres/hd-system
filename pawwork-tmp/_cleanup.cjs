const fs=require('fs'),path=require('path');
const e={};fs.readFileSync('.env.local','utf8').split('\n').forEach(l=>{const m=l.match(/^([A-Z_]+)="?([^"]*)"?$/);if(m)e[m[1]]=m[2].trim();});
const {createClient}=require(path.join(process.cwd(),'node_modules','@supabase','supabase-js'));
const s=createClient(e.VITE_SUPABASE_URL,e.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
  // limpar residuos do teste offline anterior
  const r=await s.from('stock_movements').delete().ilike('reason','%TESTE-OFFLINE%');
  console.log('Residuos limpos:', r.error? r.error.message : 'OK');
  // verificar funcoes helper existem
  const fn=await s.rpc('get_auth_user_org_id').select().limit(1).single().then(()=>true).catch(()=>false);
  console.log('get_auth_user_org_id existe:', fn);
  const sa=await s.rpc('is_superadmin').select().limit(1).single().then(()=>true).catch(()=>false);
  console.log('is_superadmin existe:', sa);
})().catch(x=>console.error('ERR',x.message));
