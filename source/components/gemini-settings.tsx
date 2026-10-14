import { useState } from 'react';
import type { GeminiConfig } from '@/lib/client-api';
import { studioFetch } from '@/lib/client-api';
export type { GeminiConfig } from '@/lib/client-api';
export function GeminiSettings({config,configError,onRefresh}:{config:GeminiConfig|null;configError:boolean;onRefresh:()=>Promise<void>;onNotice:(text:string)=>void}) {
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 return <section className="ai-provider-info"><h3>Gemini · วิเคราะห์เพลงและวางเรื่อง</h3><p>{configError?'ยังอ่านการตั้งค่าหลังบ้านไม่ได้ ตรวจว่าอัปเดต Worker รุ่น 1.5.0 แล้ว':config?.connected?'ใช้คีย์จากหลังบ้าน คุณไม่ต้องกรอก Gemini key ในเว็บ':'เพิ่ม GEMINI_API_KEY ใน Cloudflare Secrets แล้วกดตรวจการตั้งค่าอีกครั้ง'}</p><p>โมเดล: <strong>{config?.model||'ตั้งด้วย GEMINI_MODEL ที่ Cloudflare'}</strong></p>{config?.ownerConnected&&<button className="secondary" disabled={busy||!config.connected} onClick={async()=>{setBusy(true);try{const r=await studioFetch('/api/check');const b=await r.json();setMessage(b.message||b.error||'ตรวจแล้ว');}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}}>{busy?'กำลังตรวจสิทธิ์…':'ตรวจคีย์และสิทธิ์โมเดล (ไม่สร้างเรื่อง)'}</button>}<p role="status">{message}</p><small>หากเจอ 429 ต้องตรวจโควตาที่ Google การเก็บคีย์ไว้หลังบ้านไม่เพิ่มโควตาให้บัญชี</small><div className="button-row"><a className="text-button" href="https://aistudio.google.com/" target="_blank" rel="noreferrer">Google AI Studio ↗</a><button className="text-button" onClick={()=>void onRefresh()}>อัปเดตสถานะ</button></div></section>;
}
