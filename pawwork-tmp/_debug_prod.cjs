const fs=require('fs'),path=require('path');
const e={};fs.readFileSync('.env.local','utf8').split('\n').forEach(l=>{const m=l.match(/^([A-Z_]+)="?([^"]*)"?$/);if(m)e[m[1]]=m[2].trim();});
const {createClient}=require(path.join(process.cwd(),'node_modules','@supabase','supabase-js'));
const s=createClient(e.VITE_SUPABASE_URL,e.SUPABASE_SERVICE_ROLE_KEY);
const uuid=()=>'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&0x3|0x8);return v.toString(16);});

(async()=>{
  const prodId=uuid();
  console.log('Inserindo produto (sem active)...');
  const {data,error}=await s.from('products').insert({
    id:prodId,
    organization_id:'361fb95a-3e9f-43be-a43c-0dc91f851f31',
    store_branch_id:'e5085eba-4398-4c31-ae13-8082b46561ee',
    name:'Burger Teste',
    category:'Lanches',
    barcode:'123456789',
    cost_price:5,
    sale_price:15,
    current_stock:50,
    min_stock:5
  }).select().single();
  console.log('Error:',JSON.stringify(error));
  console.log('Data:',JSON.stringify(data));
})();
