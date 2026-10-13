'use client';
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { FREE_MODELS } from '@/lib/models';
import { isStaticMode, studioFetch, type GeminiConfig } from '@/lib/client-api';
export type { GeminiConfig } from '@/lib/client-api';
export function GeminiSettings({ config, configError, onRefresh, onNotice }: { config: GeminiConfig | null; configError: boolean; onRefresh: () => Promise<void>; onNotice: (text: string) => void }) {
 const input = useRef<HTMLInputElement>(null);
 const staticMode = isStaticMode();
 const [model, setModel] = useState('gemini-3.8-flash');
 const [busy, setBusy] = useState(false);
 const [message, setMessage] = useState('');
 useEffect(() => { if (config?.model && FREE_MODELS.includes(config.model)) setModel(config.model); }, [config?.model]);
 async function connect() {
  const key = input.current?.value.trim();
  if (!key) { setMessage('วาง Gemini API key ในช่องนี้ก่อน'); return; }
  setBusy(true); setMessage('');
  try {
   const r = await studioFetch('/api/key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, model }) });
   const body = await r.json() as { error?: string };
   if (!r.ok) throw new Error(body.error || 'เชื่อมต่อไม่สำเร็จ');
   await onRefresh(); setMessage(staticMode ? 'เชื่อม Gemini แล้ว คีย์อยู่เฉพาะแท็บนี้ รีเฟรชหรือปิดแท็บต้องกรอกใหม่' : 'เชื่อม Gemini แล้ว ใช้ได้เฉพาะเบราว์เซอร์นี้ 8 ชั่วโมง'); onNotice('Gemini พร้อมสร้างเรื่องแล้ว');
  } catch (e) { setMessage((e as Error).message); }
  finally { if (input.current) input.current.value = ''; setBusy(false); }
 }
 async function disconnect() {
  setBusy(true);
  try {
   const r = await studioFetch('/api/key', { method: 'DELETE' });
   if (!r.ok) throw new Error('ยกเลิกการเชื่อมต่อไม่สำเร็จ');
   await onRefresh(); setMessage('นำคีย์ของเบราว์เซอร์นี้ออกแล้ว');
  } catch (e) { setMessage((e as Error).message); }
  finally { setBusy(false); }
 }
 return <>
  <div className={`connection-summary ${config?.connected ? 'connected' : ''}`}><Sparkles size={27}/><div><h3>{configError ? 'ยังตรวจการเชื่อมต่อไม่ได้' : config?.connected ? 'Gemini พร้อมสร้างเรื่อง' : 'เชื่อม Gemini ของคุณ'}</h3><p>{config?.model || 'กำลังตรวจโมเดล'}</p></div></div>
  <p className="modal-intro">ใส่คีย์จาก Google AI Studio ในช่องนี้ ใช้สำหรับวิเคราะห์เพลงและวางเรื่อง ระบบจะไม่สลับไปใช้บริการอื่นเอง</p>
  <form onSubmit={e => { e.preventDefault(); void connect(); }}>
   <label className="field"><span>Gemini API key</span><input ref={input} type="password" autoComplete="off" spellCheck={false} disabled={busy} placeholder="วางคีย์ของคุณที่นี่" maxLength={512} aria-label="Gemini API key"/><small>คีย์ไม่ถูกแสดงกลับ ไม่บันทึกในโปรเจกต์ และไม่รวมใน GitHub</small></label>
   <label className="field"><span>โมเดลที่ต้องการใช้</span><select value={model} onChange={e => setModel(e.target.value)} disabled={busy}>{FREE_MODELS.map(m => <option key={m} value={m}>{m}</option>)}</select><small>เลือกบัญชีและรุ่นที่มีโควตาฟรีใน Google AI Studio การคิดค่าบริการขึ้นอยู่กับการตั้งค่าบัญชี Google ของคุณ</small></label>
   <div className="key-safety"><ShieldCheck size={20}/><p>{staticMode ? "โหมด GitHub Pages ส่งคำขอจากเบราว์เซอร์ของคุณไป Google โดยตรง คีย์อยู่ในหน่วยความจำของแท็บนี้เท่านั้น ไม่เก็บใน localStorage หรือไฟล์ ทุกคนที่เปิดเว็บต้องใช้คีย์ของตนเอง" : "ส่งคีย์ผ่านเว็บส่วนตัวให้ Google ตรวจสิทธิ์ แล้วเก็บแบบเข้ารหัสสำหรับเบราว์เซอร์นี้ 8 ชั่วโมง คุณยกเลิกการเชื่อมต่อได้ทุกเมื่อ"}</p></div>
   {message && <p className="modal-message" role="status">{message}</p>}
   <button className="primary full" type="submit" disabled={busy || !config?.sessionEnabled}>{busy ? <Loader2 className="spin" size={17}/> : <CheckCircle2 size={17}/>} {busy ? 'กำลังตรวจการเชื่อมต่อ…' : 'เชื่อมต่อและใช้คีย์'}</button>
  </form>
  <div className="modal-actions"><a className="text-button" href="https://aistudio.google.com/app/api-keys" target="_blank" rel="noreferrer">Google AI Studio ↗</a>{(config?.source === 'session' || config?.source === 'browser') && <button className="secondary" onClick={() => void disconnect()} disabled={busy}><Trash2 size={14}/>นำคีย์ออก</button>}<button className="text-button" onClick={() => void onRefresh()} disabled={busy}>ตรวจสถานะอีกครั้ง</button></div>
 </>;
}
