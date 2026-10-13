export type Kind = 'mv' | 'film' | 'drama' | 'tale';
export type Review = 'pending' | 'approved' | 'rejected';
export type Asset = {
    id: string;
    name: string;
    type: string;
    size: number;
    hash: string;
    blob: Blob;
};
export type Character = {
    id: string;
    name: string;
    role: string;
    description: string;
    outfit: string;
    locked: boolean;
    references: Asset[];
};
export type KlingJob = { external: string; backend: string; status: string; sourceHash: string; createdAt: number; id?: string; videoUrl?: string; message?: string; billing?: string };
export type Scene = {
    kling?: KlingJob;
    klingFrame?: Asset;
    id: string;
    title: string;
    duration: number;
    section: string;
    description: string;
    camera: string;
    motion: string;
    dialogue: string;
    characterIds: string[];
    imagePrompt: string;
    videoPrompt: string;
    review: Review;
    checked: string[];
    media?: Asset;
};
export type Project = {
    id: string;
    title: string;
    kind: Kind;
    brief: string;
    lyrics: string;
    duration: number;
    shotLength: number;
    ratio: string;
    style: string;
    styleNotes: string;
    styleLocked: boolean;
    characters: Character[];
    scenes: Scene[];
    synopsis: string;
    audio?: Asset;
    waveform: number[];
    updatedAt: number;
    createdAt: number;
};
export const KINDS: Record<Kind, {
    name: string;
    subtitle: string;
}> = { mv: { name: 'มิวสิกวิดีโอ', subtitle: 'ให้เพลงนำทางเรื่องราว' }, film: { name: 'หนังสั้น', subtitle: 'เปลี่ยนไอเดียเป็นฉากภาพยนตร์' }, drama: { name: 'ละคร / ซีรีส์', subtitle: 'เรื่องที่ต่อเนื่อง ตัวละครที่คุ้นเคย' }, tale: { name: 'นิทาน', subtitle: 'เติมชีวิตให้โลกจินตนาการ' } };
export const STYLES = ['ภาพยนตร์สมจริง', 'Anime 2D', 'ภาพวาดสีน้ำ', 'แอนิเมชัน 3D', 'Stop motion', 'กำหนดเอง'];
export const CHECKS = ['ใบหน้าและสัดส่วนตรงต้นแบบ', 'ทรงผมและเครื่องแต่งกายตรงต้นแบบ', 'สไตล์ภาพและแสงต่อเนื่อง', 'การเคลื่อนไหวไม่มีใบหน้าเปลี่ยน'];
export const IDENTITY_LOCK = 'ABSOLUTE IDENTITY LOCK. Use the original uploaded reference as the immutable identity source. No facial reconstruction, no face replacement, no facial feature modification, no face restoration, no beautification, no identity drift. Preserve original eyes, nose, mouth, jaw, facial proportions, age and defining marks. Never regenerate a face to repair a failed shot. If identity cannot be preserved, use a wider shot, back view, hands, silhouette, or cutaway instead. Attach the original reference with every generation request. Never use a generated shot as a new identity reference.';
export const NEGATIVE = 'face swap, facial reconstruction, face restoration, face editing, changed eyes, changed nose, changed mouth, altered facial proportions, different identity, age change, beautification, identity drift, inconsistent hair, different outfit, style drift, additional characters, distorted anatomy, flickering face, text, watermark';
export function uid() { return crypto.randomUUID(); }
export function newProject(kind: Kind, title: string): Project { const now = Date.now(); return { id: uid(), title: title || 'เรื่องใหม่ของฉัน', kind, brief: '', lyrics: '', duration: 60, shotLength: 6, ratio: '16:9', style: 'Anime 2D', styleNotes: 'โทนอบอุ่น แสงธรรมชาติ สีต่อเนื่องตลอดเรื่อง', styleLocked: false, characters: [], scenes: [], synopsis: '', waveform: [], updatedAt: now, createdAt: now }; }
export function timeline(scenes: Scene[]) { let time = 0; return scenes.map(scene => { const start = time; time += scene.duration; return { ...scene, start, end: time }; }); }
export function timecode(sec: number) { const n = Math.max(0, Math.round(sec)); return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`; }
export function invalidate(project: Project): Project { return { ...project, scenes: project.scenes.map(s => ({ ...s, review: 'pending', checked: [] })), updatedAt: Date.now() }; }
export function prompts(project: Project, scene: Scene) {
    const cast = project.characters.filter(c => scene.characterIds.includes(c.id)).map(c => `CHARACTER ${c.id}: ${c.name}; role: ${c.role}; ${c.description}; fixed outfit: ${c.outfit}. ORIGINAL REFERENCES: ${c.references.map(r => `${r.name} [SHA256 ${r.hash}]`).join(', ')}`).join('\n');
    const bible = `${IDENTITY_LOCK}\nCHARACTER BIBLE:\n${cast || 'No visible character faces. Use environment shots only.'}\nSTYLE LOCK: ${project.style}. ${project.styleNotes}. Apply style to environment, lighting, composition; never restyle or redraw the reference face. Aspect ratio ${project.ratio}.`;
    return { image: `${bible}\nSHOT: ${scene.title}\n${scene.description}\nCAMERA: ${scene.camera}\n${scene.imagePrompt}\nDo not add text or captions.`, video: `${bible}\nAnimate the approved start frame for ${scene.duration} seconds.\nACTION: ${scene.description}\nCAMERA: ${scene.camera}\nMOTION: ${scene.motion}\n${scene.videoPrompt}\nDIALOGUE: ${project.kind === 'mv' ? 'No dialogue. Keep the original song as the soundtrack.' : scene.dialogue || 'No dialogue.'}\nMaintain identity in every frame.`, negative: NEGATIVE };
}
export function exportProblems(p: Project) { const out: string[] = []; if (!p.scenes.length)
    out.push('ยังไม่มีช็อต'); if (p.scenes.length && Math.abs(p.scenes.reduce((n, s) => n + s.duration, 0) - p.duration) > 1)
    out.push('ความยาวช็อตรวมไม่ตรงความยาวโปรเจกต์'); if (!p.styleLocked)
    out.push('ยังไม่ได้ล็อกสไตล์ภาพ'); if (p.characters.some(c => !c.locked || !c.references.length))
    out.push('ตัวละครต้องมีภาพต้นแบบและล็อกแล้ว'); for (const [i, s] of p.scenes.entries()) {
    if (s.characterIds.some(id => !p.characters.some(c => c.id === id)))
        out.push(`ช็อต ${i + 1} อ้างอิงตัวละครที่ไม่มีในโปรเจกต์`);
    if (!s.media)
        out.push(`ช็อต ${i + 1} ยังไม่มีภาพหรือคลิป`);
    if (s.review !== 'approved' || !CHECKS.every(c => s.checked.includes(c)))
        out.push(`ช็อต ${i + 1} ยังไม่ผ่านการตรวจ`);
} return out; }
export function applyStory(p: Project, value: unknown): Project {
    if (!value || typeof value !== 'object')
        throw new Error('ผลลัพธ์ต้องเป็นข้อมูลเรื่องและช็อต');
    const v = value as Record<string, unknown>;
    if (typeof v.synopsis !== 'string' || !Array.isArray(v.scenes) || !v.scenes.length || v.scenes.length > 150)
        throw new Error('สตอรีบอร์ดไม่ครบหรือจำนวนช็อตไม่ถูกต้อง');
    const validIds = new Set(p.characters.map(c => c.id));
    const scenes = v.scenes.map((item: unknown) => { if (!item || typeof item !== 'object')
        throw new Error('ข้อมูลช็อตไม่ถูกต้อง'); const s = item as Record<string, unknown>; for (const k of ['title', 'section', 'description', 'camera', 'motion', 'dialogue', 'imagePrompt', 'videoPrompt'])
        if (typeof s[k] !== 'string' || (s[k] as string).length > 6000)
            throw new Error(`ข้อมูลช็อต ${k} ไม่ถูกต้อง`); if (typeof s.duration !== 'number' || !Number.isFinite(s.duration) || s.duration <= 0 || s.duration > 60)
        throw new Error('ความยาวช็อตต้องอยู่ระหว่าง 0–60 วินาที'); if (!Array.isArray(s.characterIds) || s.characterIds.some(id => typeof id !== 'string' || !validIds.has(id)))
        throw new Error('AI เพิ่มตัวละครที่ไม่มีในต้นแบบ กรุณาสร้างใหม่'); return { id: uid(), title: s.title as string, section: s.section as string, description: s.description as string, camera: s.camera as string, motion: s.motion as string, dialogue: s.dialogue as string, imagePrompt: s.imagePrompt as string, videoPrompt: s.videoPrompt as string, duration: s.duration, characterIds: s.characterIds as string[], review: 'pending', checked: [] } as Scene; });
    const total = scenes.reduce((n, s) => n + s.duration, 0);
    if (Math.abs(total - p.duration) > 1)
        throw new Error(`ระยะเวลาช็อตรวม ${total.toFixed(1)} วินาที ไม่ตรงความยาวโปรเจกต์ ${p.duration} วินาที กรุณาสร้างใหม่`);
    return { ...p, synopsis: v.synopsis.slice(0, 10000), scenes, updatedAt: Date.now() };
}
export function demoProject(): Project { const p = newProject('tale', 'แสงเล็ก ๆ ในป่าใหญ่'); p.duration = 24; p.brief = 'เรื่องราวของแสงหิ่งห้อยที่นำทางคนหลงป่ากลับบ้าน เล่าให้เห็นว่าความช่วยเหลือเล็ก ๆ มีความหมาย'; p.style = 'ภาพวาดสีน้ำ'; p.styleLocked = true; p.synopsis = 'ท่ามกลางป่าที่เริ่มมืด แสงเล็ก ๆ ของหิ่งห้อยค่อย ๆ นำทางกลับไปสู่หน้าต่างบ้านอันอบอุ่น เรื่องเล่าสั้น ๆ ว่าเราไม่ต้องเป็นแสงที่ใหญ่ที่สุด ก็ช่วยให้ใครบางคนเห็นทางได้'; p.scenes = [['ก่อนแสงจะลับ', 'เปิดเรื่อง', 'ป่าเงียบในช่วงเย็น แสงสุดท้ายลอดผ่านต้นไม้', 'Wide shot, eye level', 'Slow push in', 'เมื่อความมืดมาเยือน ทางกลับบ้านก็เลือนหาย'], ['แสงดวงแรก', 'พบความหวัง', 'แสงหิ่งห้อยเล็ก ๆ ปรากฏข้างใบไม้', 'Macro close-up', 'Gentle fixed camera', 'แต่ในเงามืด ยังมีแสงเล็ก ๆ รออยู่'], ['ทางที่ค่อย ๆ ชัด', 'เดินทาง', 'กลุ่มหิ่งห้อยนำทางผ่านเส้นทางในป่า ไม่มีใบหน้าบุคคลในภาพ', 'Wide tracking shot', 'Slow lateral movement', 'ทีละแสง ทีละก้าว ทางกลับบ้านก็ชัดขึ้น'], ['หน้าต่างที่อบอุ่น', 'บทสรุป', 'บ้านเล็กในป่า มีแสงอุ่นจากหน้าต่าง หิ่งห้อยหยุดอยู่ริมรั้ว', 'Wide establishing shot', 'Static shot', 'แสงเล็ก ๆ ก็พาใครสักคนกลับบ้านได้']].map(([title, section, description, camera, motion, dialogue]) => ({ id: uid(), title, section, description, camera, motion, dialogue, duration: 6, characterIds: [], imagePrompt: 'Watercolor illustration, soft pastel palette, paper texture, continuous warm light.', videoPrompt: 'Very subtle natural movement. Keep the original composition and style.', review: 'pending', checked: [] })); return p; }
