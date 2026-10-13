import type { Project, Asset } from './story';
const DB = 'storycraft-studio-v1';
function db(): Promise<IDBDatabase> { return new Promise((resolve, reject) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore('projects', { keyPath: 'id' }); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(new Error('ไม่สามารถเปิดพื้นที่บันทึกในเบราว์เซอร์นี้ได้')); }); }
export async function loadProjects(): Promise<Project[]> { const d = await db(); return new Promise((resolve, reject) => { const t = d.transaction('projects', 'readonly'); const r = t.objectStore('projects').getAll(); r.onsuccess = () => resolve((r.result as Project[]).sort((a, b) => b.updatedAt - a.updatedAt)); r.onerror = () => reject(r.error); t.oncomplete = () => d.close(); }); }
export async function saveProject(p: Project) { const d = await db(); return new Promise<void>((resolve, reject) => { const t = d.transaction('projects', 'readwrite'); t.objectStore('projects').put(p); t.oncomplete = () => { d.close(); resolve(); }; t.onerror = () => { d.close(); reject(new Error('พื้นที่บันทึกเต็ม กรุณาสำรองโปรเจกต์หรือลดขนาดไฟล์')); }; }); }
export async function deleteProject(id: string) { const d = await db(); return new Promise<void>((resolve, reject) => { const t = d.transaction('projects', 'readwrite'); t.objectStore('projects').delete(id); t.oncomplete = () => { d.close(); resolve(); }; t.onerror = () => reject(t.error); }); }
export async function makeAsset(file: File): Promise<Asset> { const buf = await file.arrayBuffer(); const digest = await crypto.subtle.digest('SHA-256', buf); return { id: crypto.randomUUID(), name: file.name, type: file.type, size: file.size, hash: Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, '0')).join(''), blob: file }; }
export function dataUrl(blob: Blob): Promise<string> { return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result as string); r.onerror = () => reject(r.error); r.readAsDataURL(blob); }); }
export async function portableProject(p: Project) {
    async function asset(a: Asset | undefined) { if (!a)
        return undefined; return { ...a, blob: undefined, data: await dataUrl(a.blob) }; }
    const characters = await Promise.all(p.characters.map(async (c) => ({ ...c, references: await Promise.all(c.references.map(asset)) })));
    const scenes = await Promise.all(p.scenes.map(async (s) => ({ ...s, media: await asset(s.media), klingFrame: await asset(s.klingFrame) })));
    return { format: 'storycraft-project', version: 1, project: { ...p, audio: await asset(p.audio), characters, scenes } };
}
export async function importProject(text: string): Promise<Project> { const raw = JSON.parse(text); if (raw.format !== 'storycraft-project' || raw.version !== 1 || !raw.project)
    throw new Error('ไฟล์นี้ไม่ใช่โปรเจกต์ StoryCraft Studio'); const p = raw.project; if (!['mv', 'film', 'drama', 'tale'].includes(p.kind) || typeof p.title !== 'string' || !Array.isArray(p.characters) || p.characters.length > 12 || !Array.isArray(p.scenes) || p.scenes.length > 150 || !Number.isFinite(p.duration) || p.duration < 1 || p.duration > 900 || !Array.isArray(p.waveform))
    throw new Error('โครงสร้างโปรเจกต์ไม่ถูกต้อง'); async function asset(a: Record<string, unknown> | undefined) { if (!a)
    return undefined; if (typeof a.data !== 'string' || !/^data:(image\/(png|jpeg|webp)|audio\/[\w.+-]+|video\/(mp4|webm));base64,/.test(a.data))
    throw new Error('ชนิดไฟล์ในโปรเจกต์ไม่รองรับ'); const match = a.data.match(/^data:([^;]+);base64,(.*)$/s)!; const binary = atob(match[2]); const bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i++)
    bytes[i] = binary.charCodeAt(i); const blob = new Blob([bytes], { type: match[1] }); const out = await makeAsset(new File([blob], typeof a.name === 'string' ? a.name : 'imported-file', { type: blob.type })); if (a.hash && a.hash !== out.hash)
    throw new Error('ไฟล์ต้นแบบเปลี่ยนจากข้อมูลที่บันทึกไว้'); return out; } p.audio = await asset(p.audio); for (const c of p.characters) {
    if (typeof c.id !== 'string' || !Array.isArray(c.references) || c.references.length > 4)
        throw new Error('ข้อมูลตัวละครไม่ถูกต้อง');
    c.references = await Promise.all(c.references.map(asset));
} for (const s of p.scenes) {
    if (!Number.isFinite(s.duration) || s.duration <= 0 || s.duration > 60 || !Array.isArray(s.characterIds))
        throw new Error('ข้อมูลช็อตไม่ถูกต้อง');
    s.media = await asset(s.media);
    s.klingFrame = await asset(s.klingFrame);
    if(s.kling && (typeof s.kling.external !== "string" || !/^storycraft-[a-f0-9-]{36}$/.test(s.kling.external) || typeof s.kling.backend !== "string")) throw new Error("เลขงาน Kling ในโปรเจกต์ไม่ถูกต้อง");
    s.review = 'pending';
    s.checked = [];
} return { ...p, id: crypto.randomUUID(), updatedAt: Date.now(), createdAt: Date.now() }; }
