import { useEffect, useState } from 'react';
import Studio from '@/app/page';
import { ownerSession } from '@/lib/owner-session';
import { checkStudioAccess } from '@/lib/auth-gate';
import { LoginPage } from './login-page';
export function StudioGate() {
 const [phase,setPhase]=useState<'checking'|'login'|'welcome'|'studio'>(ownerSession.connected()?'checking':'login');
 const [message,setMessage]=useState('');
 useEffect(()=>{const abort=new AbortController();let active=true;async function check(){try{const allowed=await checkStudioAccess(abort.signal);if(active){setPhase(allowed?'welcome':'login');setMessage('');}}catch(e){if(active&&!abort.signal.aborted){setPhase('login');setMessage((e as Error).message);}}}void check();return()=>{active=false;abort.abort();};},[]);
 useEffect(()=>{const lock=()=>{setPhase('login');setMessage('');};const expire=()=>{if((phase==='studio'||phase==='welcome')&&!ownerSession.connected()){setPhase('login');setMessage('เซสชันหมดอายุ เข้าสู่ระบบอีกครั้งเพื่อทำงานต่อ');}};window.addEventListener('storycraft-owner-logout',lock);window.addEventListener('focus',expire);const timer=window.setInterval(expire,15000);return()=>{window.removeEventListener('storycraft-owner-logout',lock);window.removeEventListener('focus',expire);window.clearInterval(timer);};},[phase]);
 return phase==='studio'?<Studio/>:<LoginPage checking={phase==='checking'} signedIn={phase==='welcome'} initialMessage={message} onEntered={()=>{if(!ownerSession.connected()){setMessage('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');setPhase('login');return;}setMessage('');setPhase('studio');}}/>;
}
