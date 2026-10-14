const STORAGE_KEY='storycraft-owner-session-v1';
export const DEFAULT_BACKEND='https://storycraft-api.thanawid.workers.dev';
export interface SessionStorage { getItem(key:string):string|null; setItem(key:string,value:string):void; removeItem(key:string):void; }
function backendURL(value:string) {
 const u=new URL(value);
 if(u.protocol!=='https:' || !u.hostname.endsWith('.workers.dev') || u.username || u.password || u.pathname!=='/' || u.search || u.hash) throw new Error('ใช้ URL https://ชื่อ-worker.ชื่อบัญชี.workers.dev เท่านั้น');
 return u.origin;
}
export function createOwnerSession(storage?:SessionStorage,now:()=>number=Date.now) {
 let endpoint=DEFAULT_BACKEND,token='',remembered=false;
 const valid=(value:string)=>/^\d+\.[a-f0-9-]{36}\.[a-f0-9]{64}$/.test(value)&&Number(value.split('.')[0])*1000>now();
 function clear(){token='';remembered=false;try{storage?.removeItem(STORAGE_KEY);}catch{}}
 try{const text=storage?.getItem(STORAGE_KEY);if(text){const saved=JSON.parse(text);endpoint=backendURL(saved.endpoint);if(typeof saved.token==='string'&&valid(saved.token)){token=saved.token;remembered=true;}else clear();}}catch{clear();endpoint=DEFAULT_BACKEND;}
 return {
  connected(){if(token&&!valid(token))clear();return !!token;},
  endpoint:()=>endpoint,
  token(){return this.connected()?token:'';},
  remembered:()=>remembered,
  expiresAt:()=>token?Number(token.split('.')[0])*1000:0,
  disconnect:clear,
  accept(url:string,value:string,remember:boolean){const next=backendURL(url);if(!valid(value))throw new Error('หลังบ้านส่งเซสชันไม่ถูกต้องหรือหมดอายุ');clear();endpoint=next;token=value;
   if(remember&&storage){try{storage.setItem(STORAGE_KEY,JSON.stringify({endpoint,token}));remembered=true;}catch{remembered=false;}}
   return remembered;
  }
 };
}
function browserStorage(){try{return typeof window!=='undefined'?window.localStorage:undefined;}catch{return undefined;}}
export const ownerSession=createOwnerSession(browserStorage());
export async function loginOwner(url:string,password:string,remember:boolean) {
 const endpoint=backendURL(url.trim());
 const r=await fetch(endpoint+'/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password,remember}),signal:AbortSignal.timeout(15000)});
 const b=await r.json();if(!r.ok)throw new Error(b.error||'เข้าสู่ระบบไม่ได้');
 const status=await fetch(endpoint+'/status',{headers:{Authorization:'Bearer '+b.token},signal:AbortSignal.timeout(15000)});
 const config=await status.json();
 if(!status.ok)throw new Error(config.error||'ตรวจหลังบ้านไม่สำเร็จ');
 if(config.serverMode!==true)throw new Error('หลังบ้านยังเป็นรุ่นเก่า กรุณาอัปเดตโค้ด Worker 1.5.0 ก่อน แล้วเข้าสู่ระบบอีกครั้ง');
 return ownerSession.accept(endpoint,b.token,remember);
}
export async function ownerFetch(path:string,init:RequestInit={}) {
 if(!ownerSession.connected())return Response.json({error:'เข้าสู่ระบบเจ้าของก่อน'}, {status:401});
 if(!/^\/(?:api\/(?:config|story|key|check)|status|jobs(?:\?.*)?)$/.test(path))throw new Error('คำขอหลังบ้านไม่ถูกต้อง');
 const headers=new Headers(init.headers);headers.set('Authorization','Bearer '+ownerSession.token());
 const signal=init.signal?AbortSignal.any([init.signal,AbortSignal.timeout(path==='/api/story'?150000:35000)]):AbortSignal.timeout(path==='/api/story'?150000:35000);
 const r=await fetch(ownerSession.endpoint()+path,{...init,headers,signal});
 // 401 on model/provider calls must not log the owner out. The Worker marks owner auth failures explicitly.
 if(r.status===401&&r.headers.get('X-StoryCraft-Session')==='expired')ownerSession.disconnect();
 return r;
}
