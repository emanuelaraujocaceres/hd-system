const fs=require('fs'),path=require('path');
const e={};fs.readFileSync('.env.local','utf8').split('\n').forEach(l=>{const m=l.match(/^([A-Z_]+)="?([^"]*)"?$/);if(m)e[m[1]]=m[2].trim();});
const {createClient}=require(path.join(process.cwd(),'node_modules','@supabase','supabase-js'));
const s=createClient(e.VITE_SUPABASE_URL,e.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
  const {data,count}=await s.from('tables').select('*',{count:'exact'});
  console.log('MESA NO BANCO:',count);
  data?.forEach(m=>console.log('  -',m.name,'|',m.qr_token,'|',m.organization_id?.slice(0,8)));
})().catch(x=>console.error(x.message));
