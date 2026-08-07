const fs=require('fs'),path=require('path');
const e={};fs.readFileSync('.env.local','utf8').split('\n').forEach(l=>{const m=l.match(/^([A-Z_]+)="?([^"]*)"?$/);if(m)e[m[1]]=m[2].trim();});
const {createClient}=require(path.join(process.cwd(),'node_modules','@supabase','supabase-js'));
const s=createClient(e.VITE_SUPABASE_URL,e.SUPABASE_SERVICE_ROLE_KEY);

(async()=>{
  // Verificar mesa especifica
  const {data,err}=await s.from('tables').select('*').eq('qr_token','msiqhc02-4oaocq4o');
  console.log('Mesa msiqhc02-4oaocq4o:',data?.length ? data[0] : 'NAO ENCONTRADA');

  // Listar todas as mesas ativas
  const {data:todas}=await s.from('tables').select('id,name,qr_token,status,store_branch_id').eq('organization_id','361fb95a-3e9f-43be-a43c-0dc91f851f31');
  console.log('\nTodas as mesas:');
  todas?.forEach(m=>console.log(`  - ${m.name} | token: ${m.qr_token} | status: ${m.status} | branch: ${m.store_branch_id?.slice(0,8)}`));
})().catch(err=>console.error('ERRO:',err.message));
