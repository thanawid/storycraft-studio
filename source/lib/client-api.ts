import { ownerSession, ownerFetch } from './owner-session.ts';
export { createStaticApi, isStaticMode } from './story-api.ts';
export type { GeminiConfig } from './story-api.ts';
import { isStaticMode } from './story-api.ts';
export const studioFetch: typeof fetch = async (input, init) => {
 if (!isStaticMode()) return fetch(input, init);
 if (ownerSession.connected()) {
  const request=input instanceof Request ? new Request(input,init) : new Request(new URL(String(input),'https://storycraft.local'),init);
  const path=new URL(request.url).pathname;
  return ownerFetch(path, {method:request.method, ...(request.method==='GET'||request.method==='HEAD'?{}:{body:await request.blob()}), headers:request.headers,signal:request.signal});
 }
 const path=input instanceof Request ? new URL(input.url).pathname : new URL(String(input),'https://storycraft.local').pathname;
 if(path==='/api/config') return Response.json({connected:false,ownerConnected:false,klingConfigured:false,serverMode:true,source:null,model:'ตั้งค่าที่หลังบ้าน',sessionEnabled:true});
 return Response.json({error:'เข้าสู่ระบบเจ้าของก่อน ไม่ต้องกรอก API key ในเว็บ'}, {status:401});
};
