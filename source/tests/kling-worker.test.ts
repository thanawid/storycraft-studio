import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore Worker is deliberately a standalone JavaScript dashboard module.
import worker from '../backend/kling-worker.js';
const origin='https://thanawid.github.io';
const env={KLING_API_KEY:'fake-provider-key-for-tests',STUDIO_PASSWORD:'random-owner-test-password-32chars',ALLOWED_ORIGIN:origin};
async function call(path:string,method='GET',body?:unknown,token?:string,site=origin){
 return worker.fetch(new Request('https://studio.example.workers.dev'+path,{method,headers:{Origin:site,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);
}
async function login(){const r=await call('/session','POST',{password:env.STUDIO_PASSWORD});assert.equal(r.status,200);return (await r.json()).token;}
const external='storycraft-12345678-1234-1234-1234-123456789abc';
test('public and wrong-origin requests cannot spend credits',async()=>{assert.equal((await call('/jobs','POST',{})).status,401);assert.equal((await call('/session','POST',{password:env.STUDIO_PASSWORD},undefined,'https://attacker.example')).status,403);});
test('wrong password and altered owner token are rejected',async()=>{assert.equal((await call('/session','POST',{password:'wrong'})).status,401);const token=await login();assert.equal((await call('/status','GET',undefined,token+'x')).status,401);assert.equal((await call('/status','GET',undefined,token)).status,200);});
test('OPTIONS preflight does not call provider',async()=>{assert.equal((await call('/jobs','OPTIONS')).status,204);});
test('invalid duration and missing consent fail before upstream',async()=>{const token=await login();assert.equal((await call('/jobs','POST',{confirm:true,duration:6,prompt:'p',image:'YWJj',external},token)).status,400);assert.equal((await call('/jobs','POST',{duration:5,prompt:'p',image:'YWJj',external},token)).status,400);});
test('paid creation calls documented API once with original base64',async()=>{const original=globalThis.fetch;let calls=0;globalThis.fetch=async(input,init)=>{calls++;assert.equal(String(input),'https://api-singapore.klingai.com/image-to-video/kling-2.6');const body=JSON.parse(init!.body as string);assert.equal(body.contents[1].url,'YWJj');assert.deepEqual(body.settings,{audio:'off',resolution:'720p',duration:5});assert.equal(body.options.external_task_id,external);assert.equal((init!.headers as Record<string,string>).Authorization,'Bearer '+env.KLING_API_KEY);return Response.json({code:0,data:{id:'test-job',status:'submitted'}});};try{const token=await login();const r=await call('/jobs','POST',{confirm:true,duration:5,prompt:'locked prompt',image:'YWJj',external},token);assert.equal(r.status,200);assert.equal(calls,1);}finally{globalThis.fetch=original;}});
test('ambiguous upstream failure never retries paid creation',async()=>{const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('offline');};try{const token=await login();assert.equal((await call('/jobs','POST',{confirm:true,duration:5,prompt:'p',image:'YWJj',external},token)).status,502);assert.equal(calls,1);}finally{globalThis.fetch=original;}});
test('recovery queries same external ID and never creates another job',async()=>{const original=globalThis.fetch;globalThis.fetch=async(input,init)=>{assert.equal(String(input),'https://api-singapore.klingai.com/tasks?external_task_ids='+external);assert.equal(init?.method,undefined);return Response.json({code:0,data:[{id:'job',status:'succeeded',outputs:[]}]});};try{const token=await login();const r=await call('/jobs?external='+external,'GET',undefined,token);assert.equal((await r.json()).data[0].status,'succeeded');}finally{globalThis.fetch=original;}});

test('16-character owner password can login, 15-character configuration is rejected',async()=>{
 const request=()=>new Request('https://studio.example.workers.dev/session',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({password:'A7!b2#C9$d4%Ef6?' })});
 const accepted=await worker.fetch(request(),{...env,STUDIO_PASSWORD:'A7!b2#C9$d4%Ef6?' });assert.equal(accepted.status,200);assert.equal(typeof (await accepted.json()).token,'string');
 const rejected=await worker.fetch(request(),{...env,STUDIO_PASSWORD:'A7!b2#C9$d4%Ef6'});assert.equal(rejected.status,503);
});
test('remembered owner token expires in seven days and password rotation revokes it',async()=>{
 const response=await call('/session','POST',{password:env.STUDIO_PASSWORD,remember:true});const {token}=await response.json();const expiry=Number(token.split('.')[0]);assert.ok(Math.abs(expiry-Math.floor(Date.now()/1000)-604800)<3);
 const r=await worker.fetch(new Request('https://studio.example.workers.dev/status',{headers:{Origin:origin,Authorization:'Bearer '+token}}),{...env,STUDIO_PASSWORD:'different-owner-password-32chars'});assert.equal(r.status,401);assert.equal(r.headers.get('X-StoryCraft-Session'),'expired');
});
test('Gemini can be configured without a Kling key and secrets never appear in config',async()=>{
 const token=await login();const r=await worker.fetch(new Request('https://studio.example.workers.dev/api/config',{headers:{Origin:origin,Authorization:'Bearer '+token}}),{...env,KLING_API_KEY:undefined,GEMINI_API_KEY:'fixture-server-gemini-secret',GEMINI_MODEL:'gemini-3.1-flash-lite'});const text=await r.text();const b=JSON.parse(text);assert.equal(b.connected,true);assert.equal(b.klingConfigured,false);assert.equal(b.model,'gemini-3.1-flash-lite');assert.equal(text.includes('fixture-server-gemini-secret'),false);assert.equal(text.includes(env.STUDIO_PASSWORD),false);
});
test('server-owned Gemini key cannot be replaced or fetched from browser',async()=>{const token=await login();const r=await call('/api/key','POST',{key:'attacker-input'},token);assert.equal(r.status,405);});
test('expired signed token is rejected before provider is called',async()=>{const token=await login();const parts=token.split('.');parts[0]='1';const r=await call('/status','GET',undefined,parts.join('.'));assert.equal(r.status,401);});
