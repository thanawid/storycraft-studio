import { CHECKS, IDENTITY_LOCK, NEGATIVE, type Project, type Scene } from './story.ts';
import { dataUrl } from './storage.ts';
let endpoint = '';
let token = '';
export function klingConnected() { return !!token; }
export function disconnectKling() { endpoint=''; token=''; }
export async function connectKling(url: string, password: string) {
 const parsed = new URL(url.trim());
 if (parsed.protocol!=='https:' || !parsed.hostname.endsWith('.workers.dev') || parsed.username || parsed.password || parsed.pathname!=='/' || parsed.search || parsed.hash) throw new Error('ใช้ URL https://ชื่อ-worker.ชื่อบัญชี.workers.dev เท่านั้น');
 const r=await fetch(parsed.origin+'/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password}),signal:AbortSignal.timeout(15000)});
 const b=await r.json(); if (!r.ok || typeof b.token!=='string') throw new Error(b.error||'เชื่อมหลังบ้านไม่ได้');
 endpoint=parsed.origin; token=b.token;
 return endpoint;
}
export async function klingRequest(path: string, body?: unknown, backend?: string) {
 if (!token || (backend && backend!==endpoint)) throw new Error('เปิดการเชื่อมต่อ AI แล้วเชื่อม Worker เดิมด้วยรหัสเจ้าของก่อน');
 const r=await fetch(endpoint+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`, ...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(35000)});
 const b=await r.json(); if (!r.ok) { if(r.status===401) token=''; throw new Error(b.error||'Kling ไม่ตอบกลับ'); } return b.data;
}
export function klingEndpoint() { return endpoint; }
export async function prepareKling(p: Project,s: Scene) {
 if (!p.styleLocked || s.review!=='approved' || !CHECKS.every(c=>s.checked.includes(c))) throw new Error('ล็อกสไตล์ และตรวจภาพเริ่มให้ผ่านทุกข้อก่อน');
 if (![5,10].includes(s.duration)) throw new Error('Kling รุ่นนี้รับ 5 หรือ 10 วินาที กรุณาแก้ความยาวช็อตแล้วตรวจภาพใหม่');
 const frame=s.media;
 if (!frame || !['image/jpeg','image/png'].includes(frame.type) || frame.size>4*1024*1024) throw new Error('ใช้ภาพเริ่ม JPG/PNG ไม่เกิน 4 MB');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await frame.blob.arrayBuffer()))).map(n=>n.toString(16).padStart(2,'0')).join('');
 if (hash!==frame.hash) throw new Error('ภาพเริ่มเปลี่ยนจากไฟล์ที่บันทึก');
 const cast=s.characterIds.map(id=>p.characters.find(c=>c.id===id));
 if (cast.some(c=>!c || !c.locked || !c.references.length)) throw new Error('ตัวละครทุกตัวต้องมีต้นแบบและล็อกแล้ว');
 // This model accepts one first frame, not a separate multi-character reference set.
 if (cast.length>1 || (cast.length===1 && !cast[0]!.references.some(r=>r.hash===hash))) throw new Error('โหมดนี้รองรับตัวละครหนึ่งคน โดยใช้ไฟล์ต้นแบบเดิมเป็นภาพเริ่มเท่านั้น ยังไม่ส่งหลายภาพอ้างอิง');
 const bitmap=await createImageBitmap(frame.blob); const valid=bitmap.width>=300 && bitmap.height>=300 && bitmap.width/bitmap.height>=0.4 && bitmap.width/bitmap.height<=2.5; bitmap.close();
 if (!valid) throw new Error('ภาพต้องกว้างและสูงอย่างน้อย 300 px และอัตราส่วน 1:2.5 ถึง 2.5:1');
 const prompt=`${cast.length ? IDENTITY_LOCK : 'Environment shot only. No visible faces or new characters. Preserve the supplied first frame.'}\nSTYLE: ${p.style}. ${p.styleNotes}\n${cast.map(c=>`${c!.name}: ${c!.description}. ${c!.outfit}`).join('\n')}\nACTION: ${s.description}\nCAMERA: ${s.camera}\nMOTION: ${s.motion}\n${s.videoPrompt}\nNo dialogue or generated audio. Avoid: ${NEGATIVE}`;
 if (prompt.length>2500) throw new Error(`Prompt ${prompt.length} ตัว เกิน 2,500 ตัว กรุณาย่อคำอธิบายฉากและข้อมูลตัวละคร`);
 return {image:(await dataUrl(frame.blob)).split(',')[1],prompt,duration:s.duration,sourceHash:hash};
}
