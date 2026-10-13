// Cloudflare Worker module. Set secrets in Cloudflare, never put their values here.
const API = 'https://api-singapore.klingai.com';
const enc = new TextEncoder();
async function signature(value, secret) {
 const key = await crypto.subtle.importKey('raw', enc.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(value)))).map(n=>n.toString(16).padStart(2,'0')).join('');
}
async function equal(a,b) {
 const x = new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(a)));
 const y = new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(b)));
 return x.reduce((n,v,i)=>n|(v^y[i]),0)===0;
}
export default { async fetch(request, env) {
 const origin = request.headers.get('Origin');
 const headers = {'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':env.ALLOWED_ORIGIN || 'https://thanawid.github.io','Vary':'Origin','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization'};
 const reply = (body,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if (origin !== headers['Access-Control-Allow-Origin']) return reply({error:'Origin not allowed'},403);
 if (request.method==='OPTIONS') return new Response(null,{status:204,headers});
 if (!env.KLING_API_KEY || !env.STUDIO_PASSWORD || env.STUDIO_PASSWORD.length<24) return reply({error:'ตั้ง KLING_API_KEY และ STUDIO_PASSWORD (อย่างน้อย 24 ตัว) ใน Cloudflare Secrets ก่อน'},503);
 try {
  const url = new URL(request.url);
  if (url.pathname==='/session' && request.method==='POST') {
   if (Number(request.headers.get('Content-Length'))>2048) return reply({error:'Request too large'},413);
   const body = await request.text(); if (body.length>2048) return reply({error:'Request too large'},413);
   const {password} = JSON.parse(body);
   if (typeof password!=='string' || !(await equal(password,env.STUDIO_PASSWORD))) return reply({error:'รหัสเจ้าของไม่ถูกต้อง'},401);
   const payload = `${Math.floor(Date.now()/1000)+3600}.${crypto.randomUUID()}`;
   return reply({token:`${payload}.${await signature(payload,env.STUDIO_PASSWORD)}`});
  }
  const token = (request.headers.get('Authorization')||'').replace(/^Bearer /,'');
  const parts = token.split('.'); const payload = parts.slice(0,2).join('.');
  if (parts.length!==3 || !Number.isFinite(Number(parts[0])) || Number(parts[0])<=Date.now()/1000 || !(await equal(parts[2],await signature(payload,env.STUDIO_PASSWORD)))) return reply({error:'กรุณาเชื่อมต่อด้วยรหัสเจ้าของอีกครั้ง'},401);
  if (url.pathname==='/status' && request.method==='GET') return reply({configured:true});
  let path, init;
  if (url.pathname==='/jobs' && request.method==='GET') {
   const external = url.searchParams.get('external');
   if (!/^storycraft-[a-f0-9-]{36}$/.test(external||'')) return reply({error:'Invalid task ID'},400);
   path = `/tasks?external_task_ids=${encodeURIComponent(external)}`;
  } else if (url.pathname==='/jobs' && request.method==='POST') {
   if (Number(request.headers.get('Content-Length'))>6000000) return reply({error:'ภาพใหญ่เกินกำหนด'},413);
   const text = await request.text(); if (text.length>6000000) return reply({error:'ภาพใหญ่เกินกำหนด'},413);
   const b = JSON.parse(text);
   if (b.confirm!==true || ![5,10].includes(b.duration) || typeof b.prompt!=='string' || !b.prompt.trim() || b.prompt.length>2500 || !/^storycraft-[a-f0-9-]{36}$/.test(b.external||'') || typeof b.image!=='string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(b.image) || b.image.length>5600000) return reply({error:'ข้อมูลสร้างคลิปไม่ถูกต้อง'},400);
   path='/image-to-video/kling-2.6';
   init={method:'POST',body:JSON.stringify({contents:[{type:'prompt',text:b.prompt},{type:'first_frame',url:b.image}],settings:{audio:'off',resolution:'720p',duration:b.duration},options:{external_task_id:b.external}})};
  } else return reply({error:'Not found'},404);
  // Exactly one upstream call. Never automatically retry a paid POST.
  const response = await fetch(API+path,{...init,headers:{Authorization:`Bearer ${env.KLING_API_KEY}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(25000),redirect:'error'});
  const data = await response.json();
  if (!response.ok || data.code!==0) return reply({error:String(data.message||'Kling ปฏิเสธคำขอ'),code:data.code},response.ok?502:response.status);
  return reply({data:data.data});
 } catch { return reply({error:'เชื่อม Kling ไม่สำเร็จ หากกดสร้างแล้ว ให้ตรวจสถานะงานเดิมก่อน อย่ากดส่งซ้ำ'},502); }
}};
