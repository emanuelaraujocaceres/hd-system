const fs=require('fs'),path=require('path');
const e={};fs.readFileSync('.env.local','utf8').split('\n').forEach(l=>{const m=l.match(/^([A-Z_]+)="?([^"]*)"?$/);if(m)e[m[1]]=m[2].trim();});
const {createClient}=require(path.join(process.cwd(),'node_modules','@supabase','supabase-js'));
const s=createClient(e.VITE_SUPABASE_URL,e.SUPABASE_SERVICE_ROLE_KEY);

(async()=>{
  console.log('=== LIMPEZA COMPLETA ===\n');

  // 1) Deletar customer_sessions primeiro
  const {data:sess}=await s.from('customer_sessions').select('id').eq('organization_id','361fb95a-3e9f-43be-a43c-0dc91f851f31');
  console.log('Sessões para deletar:',sess?.length);
  if(sess&&sess.length>0){
    await s.from('customer_sessions').delete().eq('organization_id','361fb95a-3e9f-43be-a43c-0dc91f851f31');
    console.log('✓ Sessões deletadas');
  }

  // 2) Deletar mesas
  const {data:mesas}=await s.from('tables').select('id,name').eq('organization_id','361fb95a-3e9f-43be-a43c-0dc91f851f31');
  console.log('Mesas para deletar:',mesas?.length);
  if(mesas&&mesas.length>0){
    await s.from('tables').delete().eq('organization_id','361fb95a-3e9f-43be-a43c-0dc91f851f31');
    console.log('✓ Mesas deletadas');
  }

  // 3) Criar mesa nova
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
