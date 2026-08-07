const fs=require('fs'),path=require('path');
const e={};fs.readFileSync('.env.local','utf8').split('\n').forEach(l=>{const m=l.match(/^([A-Z_]+)="?([^"]*)"?$/);if(m)e[m[1]]=m[2].trim();});
const {createClient}=require(path.join(process.cwd(),'node_modules','@supabase','supabase-js'));
const s=createClient(e.VITE_SUPABASE_URL,e.SUPABASE_SERVICE_ROLE_KEY);

(async()=>{
  console.log('=== LIMPEZA TOTAL DE MESAS ===\n');

  // Deletar TODAS as mesas da organização
  const {data:mesas}=await s.from('tables').select('id,name,qr_token').eq('organization_id','361fb95a-3e9f-43be-a43c-0dc91f851f31');
  console.log('Total de mesas:',mesas?.length);
  
  if(mesas&&mesas.length>0){
    const {error}=await s.from('tables').delete().eq('organization_id','361fb95a-3e9f-43be-a43c-0dc91f851f31');
    if(error){console.log('Erro:',error.message);return;}
    console.log('✓ Todas as mesas deletadas');
  }else{
    console.log('Nenhuma mesa encontrada');
  }

  // Criar mesa nova
  const newToken=`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
  const {data:created,err}=await s.from('tables').insert({
    organization_id:'361fb95a-3e9f-43be-a43c-0dc91f851f31',
    store_branch_id:'e5085eba-4398-4c31-ae13-8082b46561ee',
    name:'Mesa 01',
    number:1,
    qr_token:newToken,
    status:'active'
  }).select().single();
  if(err){console.log('Erro ao criar:',err.message);return;}

  console.log('\n✓ Nova mesa criada');
  console.log('  Token:',created.qr_token);
  console.log('\n📱 URL:');
  console.log(`  https://hd-system.pages.dev/#/mesa/${created.qr_token}`);
})().catch(err=>console.error('ERRO:',err.message));
