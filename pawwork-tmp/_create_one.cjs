const fs=require('fs'),path=require('path');
const e={};fs.readFileSync('.env.local','utf8').split('\n').forEach(l=>{const m=l.match(/^([A-Z_]+)="?([^"]*)"?$/);if(m)e[m[1]]=m[2].trim();});
const {createClient}=require(path.join(process.cwd(),'node_modules','@supabase','supabase-js'));
const s=createClient(e.VITE_SUPABASE_URL,e.SUPABASE_SERVICE_ROLE_KEY);

(async()=>{
  console.log('=== LIMPEZA E CRIACAO ===\n');

  // Deletar TODAS as mesas
  await s.from('tables').delete().neq('id','00000000-0000-0000-0000-000000000000');
  console.log('✓ Todas as mesas deletadas');

  // Criar 1 mesa nova
  const token=`mesa01-${Date.now().toString(36)}`;
  const {data,err}=await s.from('tables').insert({
    organization_id:'361fb95a-3e9f-43be-a43c-0dc91f851f31',
    store_branch_id:'e5085eba-4398-4c31-ae13-8082b46561ee',
    name:'Mesa 01',
    number:1,
    qr_token:token,
    status:'active'
  }).select().single();
  if(err){console.log('Erro:',err.message);return;}

  console.log('\n✓ Mesa criada');
  console.log('  Token:',data.qr_token);
  console.log('\n📱 URL:',`https://hd-system.pages.dev/#/mesa/${data.qr_token}`);
})().catch(err=>console.error('ERRO:',err.message));
