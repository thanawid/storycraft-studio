import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareKling, connectKling } from '../lib/kling-client.ts';
import { newProject, CHECKS, IDENTITY_LOCK, type Scene } from '../lib/story.ts';
import { makeAsset } from '../lib/storage.ts';
const scene:Scene={id:'s',title:'shot',duration:5,section:'intro',description:'forest',camera:'wide',motion:'slow',dialogue:'',characterIds:[],imagePrompt:'',videoPrompt:'',review:'approved',checked:[...CHECKS]};
test('client rejects invalid backend before sending owner password',async()=>{await assert.rejects(connectKling('http://example.com','secret'));await assert.rejects(connectKling('https://evil.example','secret'));});
test('requires review and supported duration before creating',async()=>{const p=newProject('mv','test');await assert.rejects(prepareKling(p,scene),/ล็อกสไตล์/);p.styleLocked=true;await assert.rejects(prepareKling(p,{...scene,duration:6}),/5 หรือ 10/);});
test('changed frame bytes cannot be submitted',async()=>{const p=newProject('mv','test');p.styleLocked=true;const media=await makeAsset(new File(['original'],'frame.png',{type:'image/png'}));await assert.rejects(prepareKling(p,{...scene,media:{...media,blob:new Blob(['changed'],{type:'image/png'})}}),/ภาพเริ่มเปลี่ยน/);});
test('generated face frame cannot substitute the original reference',async()=>{const p=newProject('mv','test');p.styleLocked=true;const media=await makeAsset(new File(['frame'],'frame.png',{type:'image/png'}));p.characters=[{id:'c',name:'A',role:'hero',description:'original',outfit:'fixed',locked:true,references:[{...media,hash:'different-hash'}]}];await assert.rejects(prepareKling(p,{...scene,characterIds:['c'],media}),/ต้นแบบเดิม/);});
test('recovery metadata and original first frame survive project import',async()=>{
 const {importProject}=await import('../lib/storage.ts');const p=newProject('mv','test');
 const frame=await makeAsset(new File(['frame'],'frame.png',{type:'image/png'}));
 const kling={external:'storycraft-12345678-1234-1234-1234-123456789abc',backend:'https://test.example.workers.dev',status:'unknown',sourceHash:frame.hash,createdAt:Date.now()};
 p.scenes=[scene];const raw={format:'storycraft-project',version:1,project:{...p,scenes:[{...scene,kling,klingFrame:{...frame,blob:undefined,data:'data:image/png;base64,ZnJhbWU='}}]}};
 const restored=await importProject(JSON.stringify(raw));assert.equal(restored.scenes[0].kling!.external,kling.external);assert.equal(restored.scenes[0].klingFrame!.hash,frame.hash);assert.equal(restored.scenes[0].review,'pending');
});
