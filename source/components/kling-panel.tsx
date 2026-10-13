import { useRef, useState } from 'react';
import { klingEndpoint, klingRequest, prepareKling } from '@/lib/kling-client';
import type { KlingJob, Project, Scene } from '@/lib/story';
export function KlingPanel({project,scene,onChange}:{project:Project;scene:Scene;onChange:(changes:Partial<Scene>)=>Promise<void>}) {
 const gate=useRef(false);const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[consent,setConsent]=useState(false);
 async function run(create:boolean) {
  if(gate.current)return;gate.current=true;setBusy(true);setMessage('');
  let job=scene.kling;
  try {
   if(create){
    if(job)throw new Error('ช็อตนี้มีงานแล้ว ตรวจสถานะหรือแนบคลิปกลับก่อน');
    const prepared=await prepareKling(project,scene);
    if(!klingEndpoint())throw new Error('เปิดการเชื่อมต่อ AI แล้วเชื่อมหลังบ้าน Kling ก่อน');
    job={external:'storycraft-'+crypto.randomUUID(),backend:klingEndpoint(),status:'unknown',sourceHash:prepared.sourceHash,createdAt:Date.now()};
    // Persist recovery ID and original frame before any paid request.
    await onChange({kling:job,klingFrame:scene.media});
    const data=await klingRequest('/jobs',{...prepared,external:job.external,confirm:true});
    if(!data || typeof data.id!=='string')throw new Error('คำตอบไม่ครบ ให้ตรวจงานเดิมก่อนส่งซ้ำ');
    await onChange({kling:{...job,id:data.id,status:data.status||'submitted'}});
    setMessage('ส่งงานแล้ว กดตรวจสถานะเป็นระยะ ไม่ต้องกดสร้างซ้ำ');
   } else {
    if(!job)return;
    const data=await klingRequest('/jobs?external='+encodeURIComponent(job.external),undefined,job.backend);
    if(!Array.isArray(data)||!data.length)throw new Error('ยังไม่พบงาน ห้ามส่งซ้ำทันที ตรวจ Generation History ใน Kling ด้วยเลขงานด้านล่าง');
    const task=data[0];const output=task.outputs?.find((x:{type:string;url?:string})=>x.type==='video'&&x.url);
    let videoUrl: string|undefined;
    if(output){const u=new URL(output.url);if(u.protocol==='https:'&&!u.username&&!u.password)videoUrl=u.href;}
    const updated:KlingJob={...job,id:String(task.id),status:String(task.status),message:String(task.message||''),videoUrl,billing:JSON.stringify(task.billing||[])};
    await onChange({kling:updated});setMessage(task.status==='succeeded'?'คลิปพร้อมแล้ว เปิดดาวน์โหลด จากนั้นเพิ่มคลิปกลับในช็อตและตรวจใบหน้าอีกครั้ง':task.message||'อัปเดตสถานะแล้ว');
   }
  }catch(e){setMessage((e as Error).message);}finally{gate.current=false;setBusy(false);}
 }
 const job=scene.kling;
 return <section className="kling-card"><h3>Kling 2.6 · ภาพเป็นวิดีโอ</h3><p>720p · 5 หรือ 10 วินาที · ปิดเสียง เพื่อใช้เพลงเดิม โหมดตัวละครใช้ต้นแบบเดิมหนึ่งคนเป็นภาพเริ่ม ยังไม่รองรับหลายภาพอ้างอิง</p>{!job?<><label className="lock-checkbox"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>ฉันอนุญาตให้ส่งภาพนี้ไป Kling และใช้ units ของบัญชีเพื่อสร้างหนึ่งช็อต</span></label><button className="primary full" disabled={busy||!consent} onClick={()=>void run(true)}>{busy?'กำลังส่ง…':'สร้างคลิปด้วย Kling (ใช้ units)'}</button></>:<><p>สถานะ: <strong>{job.status}</strong></p><small className="job-id">เลขติดตาม: {job.external}</small><button className="secondary full" disabled={busy} onClick={()=>void run(false)}>{busy?'กำลังตรวจ…':'ตรวจสถานะงานเดิม'}</button>{job.videoUrl?.startsWith("https://")&&<a className="primary full" href={job.videoUrl} target="_blank" rel="noopener noreferrer">เปิดคลิปเพื่อดาวน์โหลด ↗</a>}{job.billing&&<details><summary>การคิด units ที่ Kling ส่งกลับ</summary><pre>{job.billing}</pre></details>}<p>ดาวน์โหลดคลิปแล้วใช้ปุ่ม “เปลี่ยนภาพหรือคลิป” ด้านบน ระบบไม่อนุมัติผลลัพธ์ให้อัตโนมัติ</p>{<button className="text-button" disabled={busy} onClick={async()=>{if(window.confirm('ตรวจ Generation History ใน Kling และเก็บเลขงานแล้วหรือยัง? ถ้างานยังประมวลผล ห้ามส่งซ้ำ การล้างนี้ไม่ยกเลิกงานหรือคืน units')){await onChange({kling:undefined});setConsent(false);}}}>ล้างเลขติดตามเพื่อเริ่มงานใหม่</button>}</>}<p role="status">{message}</p><small>ถ้าขึ้น unknown ให้ตรวจงานเดิมก่อน งานที่ส่งไปแล้วไม่ถูกยกเลิกเมื่อปิดหน้าเว็บ</small></section>;
}
