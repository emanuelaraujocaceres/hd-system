const fs=require('fs'),path=require('path');
const e={};fs.readFileSync('.env.local','utf8').split('\n').forEach(l=>{const m=l.match(/^([A-Z_]+)="?([^"]*)"?$/);if(m)e[m[1]]=m[2].trim();});
const {createClient}=require(path.join(process.cwd(),'node_modules','@supabase','supabase-js'));
const s=createClient(e.VITE_SUPABASE_URL,e.SUPABASE_SERVICE_ROLE_KEY);

const ORG='361fb95a-3e9f-43be-a43c-0dc91f851f31';

(async()=>{
  console.log('=== LIMPEZA TOTAL DO BANCO ===\n');

  // 1) Deletar sale_items (FK para sales)
  const {data:saleItems}=await s.from('sale_items').select('id').eq('store_branch_id','e5085eba-4398-4c31-ae13-8082b46561ee');
  if(saleItems&&saleItems.length>0){
    await s.from('sale_items').delete().eq('store_branch_id','e5085eba-4398-4c31-ae13-8082b46561ee');
    console.log('✓',saleItems.length,'sale_items deletados');
  }

  // 2) Deletar sales
  const {data:sales}=await s.from('sales').select('id').eq('organization_id',ORG);
  if(sales&&sales.length>0){
    await s.from('sales').delete().eq('organization_id',ORG);
    console.log('✓',sales.length,'sales deletados');
  }

  // 3) Deletar customer_sessions
  const {data:sess}=await s.from('customer_sessions').select('id').eq('organization_id',ORG);
  if(sess&&sess.length>0){
    await s.from('customer_sessions').delete().eq('organization_id',ORG);
    console.log('✓',sess.length,'customer_sessions deletadas');
  }

  // 4) Deletar TODAS as mesas da organização
  const {data:mesas}=await s.from('tables').select('id,name').eq('organization_id',ORG);
  console.log('Mesas encontradas:',mesas?.length);
  if(mesas&&mesas.length>0){
    await s.from('tables').delete().eq('organization_id',ORG);
    console.log('✓',mesas.length,'mesas deletadas');
    mesas.forEach(m=>console.log('  -',m.name));
  }

  // 5) Deletar stock_movements
  const {data:sm}=await s.from('stock_movements').select('id').eq('organization_id',ORG);
  if(sm&&sm.length>0){
    await s.from('stock_movements').delete().eq('organization_id',ORG);
    console.log('✓',sm.length,'stock_movements deletados');
  }

  // 6) Criar mesa nova com token seguro
  const newToken=`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
  const {data:created,err}=await s.from('tables').insert({
    organization_id:ORG,
    store_branch_id:'e5085eba-4398-4c31-ae13-8082b46561ee',
    name:'Mesa 01',
    number:1,
    qr_token:newToken,
    status:'active'
  }).select().single();
  if(err){console.log('Erro ao criar mesa:',err.message);return;}

  console.log('\n✓ Mesa criada');
  console.log('  Nome:',created.name);
  console.log('  Token:',created.qr_token);
  console.log('\n📱 URL:',`https://hd-system.pages.dev/#/mesa/${created.qr_token}`);
})().catch(err=>console.error('ERRO:',err.message));
