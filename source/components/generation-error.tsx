'use client';
import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
export function GenerationError({ message, retryAfter, onRetry, onSettings, busy }: { message: string; retryAfter: number; onRetry: () => void; onSettings: () => void; busy: boolean }) {
 const [remaining, setRemaining] = useState(retryAfter);
 useEffect(() => { const until = Date.now() + retryAfter * 1000; const timer = setInterval(() => setRemaining(Math.max(0, Math.ceil((until - Date.now()) / 1000))), 1000); return () => clearInterval(timer); }, [retryAfter, message]);
 return <div className="generation-error" role="alert"><strong>ยังสร้างสตอรีบอร์ดไม่สำเร็จ</strong><p>{message}</p><div className="button-row"><button className="secondary" disabled={busy || remaining > 0} onClick={onRetry}><RefreshCw size={14}/>{remaining > 0 ? `ลองใหม่ได้ใน ${remaining} วินาที` : 'ลองอีกครั้ง'}</button><button className="text-button" disabled={busy} onClick={onSettings}>ตั้งค่าโมเดล Gemini</button></div></div>;
}
