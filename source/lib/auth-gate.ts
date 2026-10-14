import { ownerFetch, ownerSession } from './owner-session.ts';
export async function checkStudioAccess(signal?:AbortSignal) {
 if(!ownerSession.connected())return false;
 const response=await ownerFetch('/api/config',{signal});
 if(response.status===401){ownerSession.disconnect();return false;}
 if(!response.ok)throw new Error('ตรวจการเข้าสู่ระบบไม่ได้ ลองเข้าสู่ระบบอีกครั้งหรือตรวจหลังบ้าน');
 const config=await response.json();
 if(config.ownerConnected!==true || config.serverMode!==true)throw new Error('อัปเดต Worker เป็นรุ่น 1.5.0 ขึ้นไปก่อนเข้าสตูดิโอ');
 return true;
}
export function announceOwnerLogout(){if(typeof window!=='undefined')window.dispatchEvent(new Event('storycraft-owner-logout'));}
