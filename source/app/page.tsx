'use client';
import { useEffect, useRef, useState, type ReactNode, type ChangeEvent } from 'react';
import { GeminiSettings } from '@/components/gemini-settings';
import { isStaticMode, studioFetch, type GeminiConfig } from '@/lib/client-api';
import { GenerationError } from '@/components/generation-error';
import { ArrowDownToLine, ArrowLeft, ArrowRight, AudioLines, BookOpen, Check, CheckCircle2, ChevronDown, Clapperboard, Copy, Download, FileText, Film, FolderOpen, ImagePlus, LayoutDashboard, ListVideo, Loader2, LockKeyhole, MoreHorizontal, Music2, Palette, Play, Plus, Search, Settings2, ShieldCheck, Sparkles, Trash2, UnlockKeyhole, Upload, Users, WandSparkles, X } from 'lucide-react';
import { KINDS, STYLES, CHECKS, IDENTITY_LOCK, NEGATIVE, applyStory, demoProject, exportProblems, invalidate, newProject, prompts, timecode, timeline, uid, type Asset, type Character, type Kind, type Project, type Scene } from '@/lib/story';
import { deleteProject, importProject, loadProjects, makeAsset, portableProject, saveProject } from '@/lib/storage';
import { analyzeAudio, compressAudio, download, renderVideo } from '@/lib/media';
const steps = [{ title: 'เรื่องและเพลง', icon: FileText }, { title: 'ตัวละคร', icon: Users }, { title: 'สไตล์ภาพ', icon: Palette }, { title: 'สตอรีบอร์ด', icon: ListVideo }, { title: 'ส่งออก', icon: Download }];
const KindIcon = ({ kind, size = 21 }: {
    kind: Kind;
    size?: number;
}) => kind === 'mv' ? <Music2 size={size}/> : kind === 'film' ? <Film size={size}/> : kind === 'drama' ? <Clapperboard size={size}/> : <BookOpen size={size}/>;
function useBlob(blob?: Blob) { const [url, setUrl] = useState(''); useEffect(() => { if (!blob) {
    setUrl('');
    return;
} const u = URL.createObjectURL(blob); setUrl(u); return () => URL.revokeObjectURL(u); }, [blob]); return url; }
function Media({ asset, className = '', controls = false }: {
    asset?: Asset;
    className?: string;
    controls?: boolean;
}) { const url = useBlob(asset?.blob); if (!url)
    return null; return asset?.type.startsWith('video/') ? <video className={className} src={url} controls={controls} muted={!controls} preload="metadata" playsInline/> : <img className={className} src={url} alt={asset?.name || 'ภาพช็อต'}/>; }
function Modal({ title, children, onClose, wide = false, message }: {
    title: string;
    children: ReactNode;
    onClose: () => void;
    wide?: boolean;
    message?: string;
}) { const ref = useRef<HTMLDialogElement>(null); useEffect(() => { if (!ref.current?.open)
    ref.current?.showModal(); }, []); return <dialog ref={ref} className={`modal ${wide ? 'wide' : ''}`} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget)
    onClose(); }}><div className="modal-title"><h2>{title}</h2><button className="icon-btn" aria-label="ปิด" onClick={onClose}><X size={21}/></button></div>{message && <p className="modal-message" role="status">{message}</p>}{children}</dialog>; }
function Field({ label, children, hint }: {
    label: string;
    children: ReactNode;
    hint?: string;
}) { return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
function Tag({ children, tone = 'gray' }: {
    children: ReactNode;
    tone?: string;
}) { return <span className={`tag ${tone}`}>{children}</span>; }
function Art({ kind = 'tale', small = false }: {
    kind?: Kind;
    small?: boolean;
}) { return <div className={`scene-art ${kind} ${small ? 'small' : ''}`} aria-hidden="true"><div className="art-sun"/><div className="art-cloud cloud-a"/><div className="art-cloud cloud-b"/><div className="art-hill hill-a"/><div className="art-hill hill-b"/><div className="art-path"/><div className="art-tree tree-a"/><div className="art-tree tree-b"/><div className="art-spark spark-a"/><div className="art-spark spark-b"/><div className="art-window"/></div>; }
export default function Studio() {
    const versions = useRef<Map<string, number>>(new Map());
    const [projects, setProjects] = useState<Project[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [ready, setReady] = useState(false);
    const [step, setStep] = useState(0);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<Kind | 'all'>('all');
    const [showCreate, setShowCreate] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [createKind, setCreateKind] = useState<Kind>('mv');
    const [createTitle, setCreateTitle] = useState('');
    const [notice, setNotice] = useState('');
    const [generationError, setGenerationError] = useState<{projectId:string;message:string;retryAfter:number}|null>(null);
    const [saved, setSaved] = useState('บันทึกแล้ว');
    const [busy, setBusy] = useState('');
    const [consent, setConsent] = useState(false);
    const [config, setConfig] = useState<GeminiConfig | null>(null);
    const [configError, setConfigError] = useState(false);
    const [effects, setEffects] = useState(true);
    const staticMode = isStaticMode();
    useEffect(() => { try { setEffects(localStorage.getItem('storycraft-effects') !== 'off'); } catch { /* Keep the default when storage is unavailable. */ } }, []);
    function toggleEffects() { const next = !effects; setEffects(next); try { localStorage.setItem('storycraft-effects', next ? 'on' : 'off'); } catch { /* This preference is optional. */ } }
    const [selectedScene, setSelectedScene] = useState<string | null>(null);
    const [charModal, setCharModal] = useState<Character | null>(null);
    const [renderProgress, setRenderProgress] = useState(0);
    const [confirmReplace, setConfirmReplace] = useState(false);
    const abort = useRef<AbortController | null>(null);
    const audioInput = useRef<HTMLInputElement>(null);
    const importInput = useRef<HTMLInputElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const [playTime, setPlayTime] = useState(0);
    const active = projects.find(p => p.id === activeId);
    const audioUrl = useBlob(active?.audio?.blob);
    const scene = active?.scenes.find(s => s.id === selectedScene);
    const viewed = projects.filter(p => (filter === 'all' || p.kind === filter) && p.title.toLowerCase().includes(search.toLowerCase()));
    useEffect(() => { loadProjects().then(list => { list.forEach(p => versions.current.set(p.id, p.updatedAt)); setProjects(list); }).catch(e => setNotice(e.message)).finally(() => setReady(true)); void refreshConfig(); }, []);
    useEffect(() => { if (!ready)
        return; const dirty = projects.filter(p => versions.current.get(p.id) !== p.updatedAt); if (!dirty.length)
        return; setSaved('กำลังบันทึก…'); const t = setTimeout(() => { Promise.all(dirty.map(async (p) => { await saveProject(p); versions.current.set(p.id, p.updatedAt); })).then(() => setSaved('บันทึกแล้ว')).catch(e => { setSaved('บันทึกไม่สำเร็จ'); setNotice(e.message); }); }, 450); return () => clearTimeout(t); }, [projects, ready]);
    useEffect(() => { if (!notice)
        return; const t = setTimeout(() => setNotice(''), 6500); return () => clearTimeout(t); }, [notice]);
    async function refreshConfig() { try {
        setConfigError(false);
        const r = await studioFetch('/api/config', { cache: 'no-store' });
        if (!r.ok)
            throw new Error();
        setConfig(await r.json());
    }
    catch {
        setConfigError(true);
    } }
    function commit(p: Project) { setProjects(list => list.map(x => x.id === p.id ? { ...p, updatedAt: Date.now() } : x)); }
    function patch(changes: Partial<Project>, reset = false) { if (active)
        commit(reset ? invalidate({ ...active, ...changes }) : { ...active, ...changes }); }
    function patchScene(id: string, changes: Partial<Scene>, reset = true) { if (active)
        patch({ scenes: active.scenes.map(s => s.id === id ? { ...s, ...changes, ...(reset ? { review: 'pending' as const, checked: [] } : {}) } : s) }); }
    async function add(p: Project) { await saveProject(p); setProjects(list => [p, ...list]); setActiveId(p.id); setStep(0); setShowCreate(false); setCreateTitle(''); setConsent(false); }
    async function remove(p: Project) { if (!window.confirm(`ลบโปรเจกต์ “${p.title}” และไฟล์ที่เก็บในอุปกรณ์นี้? ควรสำรองโปรเจกต์ก่อน`))
        return; try {
        await deleteProject(p.id);
        setProjects(list => list.filter(x => x.id !== p.id));
        if (activeId === p.id)
            setActiveId(null);
    }
    catch (e) {
        setNotice((e as Error).message);
    } }
    async function handleImport(e: ChangeEvent<HTMLInputElement>) { const f = e.target.files?.[0]; e.target.value = ''; if (!f)
        return; if (f.size > 200 * 1024 * 1024) {
        setNotice('โปรเจกต์ใหญ่เกิน 200 MB');
        return;
    } try {
        setBusy('กำลังนำเข้าโปรเจกต์');
        const p = await importProject(await f.text());
        await add(p);
        setNotice('นำเข้าแล้ว กรุณาตรวจช็อตอีกครั้งก่อนส่งออก');
    }
    catch (e) {
        setNotice((e as Error).message);
    }
    finally {
        setBusy('');
    } }
    async function handleAudio(file?: File) { if (!file || !active)
        return; if (file.size > 60 * 1024 * 1024) {
        setNotice('ไฟล์เสียงต้องไม่เกิน 60 MB');
        return;
    } if (!/\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name)) {
        setNotice('รองรับ MP3, WAV, M4A, AAC, OGG และ FLAC');
        return;
    } try {
        setBusy('กำลังอ่านเสียงและรูปคลื่น');
        const result = await analyzeAudio(file);
        if (result.duration > 900)
            throw new Error('รองรับเสียงไม่เกิน 15 นาที กรุณาแบ่งละครหรือเรื่องยาวเป็นตอน');
        const asset = await makeAsset(file);
        commit(invalidate({ ...active, audio: asset, ...result }));
        setNotice('อ่านไฟล์แล้ว เสียงต้นฉบับจะถูกเก็บไว้ครบ');
    }
    catch (e) {
        setNotice((e as Error).message || 'อ่านไฟล์เสียงไม่ได้');
    }
    finally {
        setBusy('');
    } }
    async function addReferences(files: FileList | null) { if (!charModal || !files)
        return; try {
        setBusy('กำลังเก็บภาพต้นแบบ');
        const list = Array.from(files);
        if (list.length + charModal.references.length > 4)
            throw new Error('เพิ่มภาพต้นแบบได้ไม่เกิน 4 ภาพต่อตัวละคร');
        if (list.some(f => !['image/jpeg', 'image/png', 'image/webp'].includes(f.type) || f.size > 4 * 1024 * 1024))
            throw new Error('ใช้ภาพ JPG, PNG หรือ WebP ขนาดไม่เกิน 4 MB ต่อภาพ');
        const refs = await Promise.all(list.map(makeAsset));
        setCharModal({ ...charModal, references: [...charModal.references, ...refs] });
    }
    catch (e) {
        setNotice((e as Error).message);
    }
    finally {
        setBusy('');
    } }
    async function saveCharacter() { if (!charModal || !active)
        return; if (!charModal.name.trim()) {
        setNotice('ใส่ชื่อตัวละครก่อน');
        return;
    } const original = active.characters.find(c => c.id === charModal.id); if (original && JSON.stringify({ ...original, references: original.references.map(r => r.id) }) === JSON.stringify({ ...charModal, references: charModal.references.map(r => r.id) })) {
        setCharModal(null);
        return;
    } const existing = !!original; patch({ characters: existing ? active.characters.map(c => c.id === charModal.id ? charModal : c) : [...active.characters, charModal] }, true); setCharModal(null); }
    async function generate() { if (!active || busy)
        return; if (!config?.connected) {
        setShowSettings(true);
        return;
    } if (!consent) {
        setNotice('ยืนยันส่งข้อมูลให้ Gemini ก่อน');
        return;
    } if (!active.styleLocked) {
        setStep(2);
        setNotice('ล็อกสไตล์ภาพก่อนสร้างเรื่อง');
        return;
    } if (active.characters.some(c => !c.locked || !c.references.length)) {
        setStep(1);
        setNotice('เพิ่มต้นแบบและล็อกตัวละครทุกตัวก่อน');
        return;
    } if (active.scenes.length && !confirmReplace) {
        setConfirmReplace(true);
        return;
    } setConfirmReplace(false); setGenerationError(null); const id = active.id; let retryAfter = 0; abort.current = new AbortController(); try {
        setBusy('Gemini กำลังฟังและวางเรื่อง…');
        const form = new FormData();
        const { audio, waveform, scenes, ...meta } = active;
        form.append('project', JSON.stringify({ ...meta, characters: active.characters.map(c => ({ ...c, references: c.references.map(({ blob, ...r }) => r) })) }));
        form.append('consent', 'yes');
        if (active.audio) {
            const optimized = await compressAudio(active.audio.blob);
            form.append('audio', optimized, 'song-analysis.wav');
        }
        for (const c of active.characters)
            for (const ref of c.references)
                form.append(`ref-${ref.id}`, ref.blob, ref.name);
        const response = await studioFetch('/api/story', { method: 'POST', body: form, signal: abort.current.signal });
        const body = await response.json() as {
            error?: string; retryAfter?: number;
        };
        if (!response.ok) { retryAfter = body.retryAfter || 0; throw new Error(body.error || 'สร้างเรื่องไม่สำเร็จ'); }
        const next = applyStory(active, body);
        setProjects(list => list.map(p => p.id === id ? next : p));
        setStep(3);
        setNotice('สร้างสตอรีบอร์ดแล้ว ตรวจและปรับแต่ละช็อตได้เลย');
    }
    catch (e) {
        setNotice((e as Error).name === 'AbortError' ? 'ยกเลิกแล้ว โควตาที่ส่งไปแล้วอาจยังถูกใช้' : (e as Error).message);
        if((e as Error).name !== 'AbortError') setGenerationError({projectId:id,message:(e as Error).message,retryAfter});
    }
    finally {
        setBusy('');
        abort.current = null;
    } }
    async function attachScene(file: File | undefined, id: string) { if (!file)
        return; if (!['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'].includes(file.type) || file.size > 80 * 1024 * 1024) {
        setNotice('รองรับ JPG/PNG/WebP/MP4/WebM ขนาดไม่เกิน 80 MB');
        return;
    } try {
        setBusy('กำลังเก็บไฟล์ช็อต');
        const asset = await makeAsset(file);
        patchScene(id, { media: asset });
        setNotice('เพิ่มไฟล์แล้ว ต้องตรวจใบหน้าก่อนอนุมัติช็อต');
    }
    catch (e) {
        setNotice((e as Error).message);
    }
    finally {
        setBusy('');
    } }
    async function copy(text: string) { try {
        await navigator.clipboard.writeText(text);
        setNotice('คัดลอกแล้ว พร้อมนำไปใช้');
    }
    catch {
        setNotice('เบราว์เซอร์ไม่อนุญาตคัดลอก กรุณาเลือกข้อความแล้วคัดลอกเอง');
    } }
    function safeName(p: Project) { return p.title.replace(/[\\/:*?"<>|]/g, '_') || 'storycraft'; }
    async function backup(p: Project) { try {
        setBusy('กำลังสำรองโปรเจกต์พร้อมไฟล์');
        const data = await portableProject(p);
        download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `${safeName(p)}.storycraft.json`);
        setNotice('สำรองทั้งข้อมูล ภาพต้นแบบ เพลง และไฟล์ช็อตแล้ว');
    }
    catch (e) {
        setNotice((e as Error).message);
    }
    finally {
        setBusy('');
    } }
    function exportText(type: 'csv' | 'md' | 'srt') { if (!active)
        return; const p = active; let text = ''; if (type === 'csv') {
        const esc = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
        const rows = [['ช็อต', 'เริ่ม', 'จบ', 'ท่อน', 'ชื่อ', 'ภาพ', 'กล้อง', 'การเคลื่อนไหว', 'บทพูด', 'Prompt ภาพ', 'Prompt วิดีโอ', 'Negative Prompt', 'สถานะตรวจ'], ...timeline(p.scenes).map((s, i) => { const pr = prompts(p, s); return [i + 1, timecode(s.start), timecode(s.end), s.section, s.title, s.description, s.camera, s.motion, s.dialogue, pr.image, pr.video, pr.negative, s.review]; })];
        text = '\ufeff' + rows.map(r => r.map(esc).join(',')).join('\r\n');
    }
    else if (type === 'md') {
        text = `# ${p.title}\n\n${KINDS[p.kind].name} · ${p.ratio} · ${timecode(p.duration)}\n\n## เรื่องย่อ\n${p.synopsis || p.brief}\n\n## กฎตัวละคร\n${IDENTITY_LOCK}\n\n## สไตล์ภาพ\n${p.style} · ${p.styleNotes}\n\n` + p.characters.map(c => `### ${c.name}\n${c.role}\n${c.description}\nชุด: ${c.outfit}\nภาพอ้างอิง: ${c.references.map(r => `${r.name} (${r.hash})`).join(', ')}\n`).join('\n') + '\n## สตอรีบอร์ด\n' + timeline(p.scenes).map((s, i) => { const pr = prompts(p, s); return `\n### ช็อต ${i + 1}: ${s.title} (${timecode(s.start)}–${timecode(s.end)})\n${s.description}\n\n**ภาพ**\n\n${pr.image}\n\n**วิดีโอ**\n\n${pr.video}\n\n**Negative**\n\n${NEGATIVE}\n`; }).join('');
    }
    else {
        const stamp = (n: number) => { const ms = Math.round(n * 1000); return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
        text = timeline(p.scenes).filter(s => s.dialogue.trim()).map((s, i) => `${i + 1}\n${stamp(s.start)} --> ${stamp(s.end)}\n${s.dialogue}\n`).join('\n');
        if (!text) {
            setNotice('ยังไม่มีบทพูดสำหรับทำคำบรรยาย MV จะไม่ใช้ชื่อช็อตแทนเนื้อเพลง');
            return;
        }
    } download(new Blob([text], { type: 'text/plain;charset=utf-8' }), `${safeName(p)}.${type}`); }
    async function exportVideo() { if (!active)
        return; const problems = exportProblems(active); if (problems.length) {
        setNotice(problems[0]);
        return;
    } abort.current = new AbortController(); try {
        setBusy('กำลังประกอบวิดีโอ กรุณาเปิดหน้านี้ไว้');
        setRenderProgress(0);
        const result = await renderVideo(active, setRenderProgress, abort.current.signal);
        download(result.blob, `${safeName(active)}.${result.extension}`);
        setNotice('ส่งออกวิดีโอแล้ว');
    }
    catch (e) {
        setNotice((e as Error).message);
    }
    finally {
        setBusy('');
        abort.current = null;
        setRenderProgress(0);
    } }
    function addScene() { if (!active || active.scenes.length >= 150)
        return; const s: Scene = { id: uid(), title: `ช็อต ${active.scenes.length + 1}`, duration: active.shotLength, section: '', description: '', camera: 'Medium shot, eye level', motion: 'Gentle camera movement', dialogue: '', characterIds: [], imagePrompt: '', videoPrompt: '', review: 'pending', checked: [] }; patch({ scenes: [...active.scenes, s] }); setSelectedScene(s.id); }
    function moveScene(id: string, direction: number) { if (!active)
        return; const list = [...active.scenes]; const at = list.findIndex(s => s.id === id); if (at + direction < 0 || at + direction >= list.length)
        return; [list[at], list[at + direction]] = [list[at + direction], list[at]]; patch({ scenes: list.map(s => ({ ...s, review: 'pending', checked: [] })) }); }
    const approved = active?.scenes.filter(s => s.review === 'approved').length || 0;
    return <div className={`studio-shell ${busy ? "is-busy" : ""} ${effects ? "motion-on" : "motion-off"}`} aria-busy={!!busy}><aside className="sidebar"><button className="brand" onClick={() => setActiveId(null)}><span className="brand-symbol"><Clapperboard size={25}/></span><span>StoryCraft<small>เล่าเรื่อง Studio</small></span></button><div className="nav-label">พื้นที่สร้างสรรค์</div><button className={`nav-item ${!active ? 'selected' : ''}`} onClick={() => setActiveId(null)}><LayoutDashboard size={19}/>สตูดิโอของฉัน</button><button className="nav-item" onClick={() => setShowCreate(true)}><Plus size={19}/>เริ่มเรื่องใหม่</button><button className="nav-item" onClick={() => importInput.current?.click()}><FolderOpen size={19}/>นำเข้าโปรเจกต์</button><div className="nav-divider"/><div className="nav-label">เรื่องที่กำลังเล่า <span>{projects.length}</span></div><div className="sidebar-projects">{projects.slice(0, 6).map(p => <button key={p.id} className={`nav-project ${p.id === activeId ? 'current' : ''}`} onClick={() => { setActiveId(p.id); setStep(0); setConsent(false); }}><span className={`mini-kind ${p.kind}`}><KindIcon kind={p.kind} size={15}/></span><span>{p.title}</span></button>)}{!projects.length && <p className="sidebar-empty">เรื่องแรกของคุณ<br />กำลังรอการเริ่มต้น</p>}</div><div className="sidebar-bottom"><div className="lock-note"><ShieldCheck size={22}/><div>ต้นแบบเดียว ตลอดเรื่อง<small>ตรวจทุกช็อตก่อนนำไปใช้</small></div></div><button className="nav-item" onClick={() => setShowSettings(true)}><Settings2 size={19}/>การเชื่อมต่อ Gemini<span className={`status-dot ${config?.connected ? 'online' : ''}`}/></button><div className="sidebar-version">StoryCraft Studio <span>v1.3.1</span></div></div></aside>
 <div className="workspace"><header className="topbar"><div className="breadcrumb"><span>สตูดิโอ</span>{active && <><span className="crumb-sep">/</span><strong>{active.title}</strong></>}</div><div className="top-actions"><button className={`motion-toggle ${effects ? "enabled" : ""}`} aria-label="เอฟเฟกต์หน้าเว็บ" aria-pressed={effects} title={effects ? "ปิดเอฟเฟกต์หน้าเว็บ" : "เปิดเอฟเฟกต์หน้าเว็บ"} onClick={toggleEffects}><Sparkles size={16}/><span>เอฟเฟกต์</span></button>{active && <span className={`save-state ${saved === 'บันทึกไม่สำเร็จ' ? 'error-text' : ''}`}><CheckCircle2 size={14}/>{saved}</span>}<button className="connection" onClick={() => setShowSettings(true)}><span className={`status-dot ${config?.connected ? 'online' : ''}`}/><span>{configError ? 'ตรวจการเชื่อมต่อ' : config?.connected ? 'ตรวจคีย์ Gemini ผ่าน' : 'เชื่อม Gemini'}</span><ChevronDown size={13}/></button><div className="avatar">T</div></div></header>
 {!active ? <main className="dashboard"><div className="greeting"><div><div className="eyebrow"><span /> YOUR CREATIVE SPACE</div><h1>วันนี้… อยากเล่าเรื่องอะไร?</h1><p>หนัง ละคร นิทาน หรือเพลงหนึ่งเพลง — เริ่มต้นเรื่องของคุณที่นี่</p></div><button className="primary" onClick={() => setShowCreate(true)}><Plus size={18}/>เริ่มเรื่องใหม่</button></div><section className="hero"><div className="hero-copy"><Tag tone="orange"><Sparkles size={12}/>จากไอเดีย สู่เรื่องราว</Tag><h2>ทุกจินตนาการ<br />เล่าเป็นภาพได้<span>.</span></h2><p>วางเรื่องให้มีจังหวะ เก็บตัวละครให้ต่อเนื่อง<br />แล้วค่อย ๆ สร้างโลกของคุณ ทีละช็อต</p><button className="hero-button" onClick={() => setShowCreate(true)}>เริ่มสร้างเรื่องของฉัน<ArrowRight size={17}/></button><div className="hero-foot"><LockKeyhole size={13}/>ตัวละคร · สไตล์ภาพ · สตอรีบอร์ด ในโปรเจกต์เดียว</div></div><div className="hero-visual"><div className="floating-note"><span className="check-round"><Check size={13}/></span><div>Character continuity<small>ภาพต้นแบบพร้อมอ้างอิง</small></div></div><div className="film-frame"><div className="frame-header"><span /><span /><span /><div>STORYCRAFT ORIGINAL</div></div><Art /><div className="frame-footer"><span>SCENE 01</span><span>ทุกเรื่อง เริ่มจากภาพหนึ่งภาพ</span><Play size={13}/></div></div><div className="floating-scene"><Film size={17}/><div>ไอเดียแรก → ช็อตแรก<small>เรื่องของคุณ กำลังก่อตัว</small></div><span className="tiny-wave">▂ ▃ ▆ ▃ ▂</span></div><div className="hero-doodle"><Sparkles size={28}/></div></div></section>
 <section className="home-actions" aria-label="เริ่มใช้งานสตูดิโอ"><div><h2>เริ่มทำงานของคุณ</h2><p>สร้างเรื่องใหม่ หรือนำงานเดิมกลับมาทำต่อ</p></div><div className="button-row"><button className="primary" onClick={() => setShowCreate(true)}><Plus size={18}/>สร้างโปรเจกต์</button><button className="secondary" onClick={() => importInput.current?.click()}><FolderOpen size={18}/>นำเข้าโปรเจกต์</button><button className="secondary" onClick={() => setShowSettings(true)}><Settings2 size={18}/>ตั้งค่า AI</button></div><p className="home-ai-status">{config?.connected ? "ตรวจคีย์และโมเดลผ่านแล้ว การสร้างเรื่องยังขึ้นอยู่กับสิทธิ์ โควตา และสถานะบริการ Google" : "จัดโปรเจกต์และวางช็อตเองได้ทันที เชื่อม Gemini เมื่อต้องการให้ AI ช่วยเขียนเรื่อง"}</p></section>
 <div className="section-heading"><h2>เลือกเรื่องที่อยากสร้าง</h2><span>หนึ่งสตูดิโอ หลายวิธีเล่า</span></div><div className="type-grid">{(Object.keys(KINDS) as Kind[]).map((kind, i) => <button key={kind} className={`type-card ${kind}`} onClick={() => { setCreateKind(kind); setShowCreate(true); }}><span className="type-icon"><KindIcon kind={kind} size={24}/></span><div><h3>{KINDS[kind].name}</h3><p>{KINDS[kind].subtitle}</p></div><ArrowRight size={17}/><span className="type-number">0{i + 1}</span></button>)}</div>
 <section className="project-section"><div className="section-heading"><h2>โปรเจกต์ของฉัน <span className="count">{projects.length}</span></h2><button className="text-button" onClick={() => importInput.current?.click()}><Upload size={15}/>นำเข้าโปรเจกต์</button></div><div className="project-toolbar"><div className="filter-pills"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>ทั้งหมด</button>{(Object.keys(KINDS) as Kind[]).map(k => <button className={filter === k ? 'active' : ''} key={k} onClick={() => setFilter(k)}>{KINDS[k].name}</button>)}</div><div className="search"><Search size={16}/><input aria-label="ค้นหาโปรเจกต์" placeholder="ค้นหาเรื่องของคุณ…" value={search} onChange={e => setSearch(e.target.value)}/></div></div>{!ready ? <div className="empty-state"><Loader2 className="spin"/><h3>กำลังเปิดสตูดิโอ…</h3></div> : viewed.length ? <div className="project-grid">{viewed.map(p => <article key={p.id} className="project-card"><button className="project-thumb" onClick={() => { setActiveId(p.id); setStep(p.scenes.length ? 3 : 0); setConsent(false); }}>{p.scenes.find(s => s.media)?.media ? <Media asset={p.scenes.find(s => s.media)?.media}/> : <Art kind={p.kind} small/>}<Tag tone={p.kind === 'mv' ? 'orange' : 'green'}><KindIcon kind={p.kind} size={12}/>{KINDS[p.kind].name}</Tag></button><div className="project-card-body"><div className="project-title"><button onClick={() => { setActiveId(p.id); setStep(0); }}>{p.title}</button><button className="icon-btn" title="ลบโปรเจกต์" aria-label={`ลบ ${p.title}`} onClick={() => remove(p)}><Trash2 size={15}/></button></div><p>{p.scenes.length} ช็อต <span>·</span> {timecode(p.duration)} <span>·</span> {p.ratio}</p><div className="project-card-bottom"><span><span className="status-dot"/>{p.scenes.length ? 'กำลังสร้างเรื่อง' : 'เริ่มต้นโปรเจกต์'}</span><small>{new Date(p.updatedAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</small></div></div></article>)}</div> : <div className="empty-state"><div className="empty-icon"><Clapperboard size={30}/></div><h3>{projects.length ? 'ยังไม่พบเรื่องที่ค้นหา' : 'หน้ากระดาษแรก ยังเป็นของคุณ'}</h3><p>{projects.length ? 'ลองเปลี่ยนคำค้นหรือประเภทงาน' : 'เริ่มเรื่องใหม่ หรือเปิดตัวอย่างเพื่อเดินดูสตูดิโอ'}</p><div className="button-row"><button className="primary" onClick={() => setShowCreate(true)}><Plus size={16}/>เริ่มเรื่องแรก</button><button className="secondary" onClick={() => { void add(demoProject()).then(() => setStep(3)); }}>ลองโปรเจกต์ตัวอย่าง<ArrowRight size={15}/></button></div></div>}</section><div className="dashboard-foot"><ShieldCheck size={16}/><p>โปรเจกต์บันทึกในเบราว์เซอร์ของอุปกรณ์นี้ สำรองไฟล์เมื่อต้องการย้ายเครื่อง</p><a href="https://github.com/thanawid/storycraft-studio" target="_blank" rel="noreferrer">GitHub ↗</a></div></main> : <main className="editor" key={`${active.id}-${step}`}><div className="editor-heading"><div><button className="back-link" onClick={() => setActiveId(null)}><ArrowLeft size={14}/>โปรเจกต์ทั้งหมด</button><h1>{active.title}</h1><p><Tag tone="orange"><KindIcon kind={active.kind} size={12}/>{KINDS[active.kind].name}</Tag><span>{active.ratio}</span><span>{timecode(active.duration)}</span><span>{active.scenes.length} ช็อต</span></p></div><button className="secondary" disabled={!!busy} onClick={() => backup(active)}><ArrowDownToLine size={17}/>สำรองโปรเจกต์</button></div><nav className="workflow-tabs" aria-label="ขั้นตอนสร้างเรื่อง">{steps.map((s, i) => <button key={s.title} onClick={() => setStep(i)} className={step === i ? 'active' : ''}><span>{i + 1}</span><s.icon size={17}/><strong>{s.title}</strong></button>)}</nav>
 {step === 0 && <div className="editor-grid"><section className="panel"><div className="panel-heading"><div className="panel-icon orange"><FileText size={21}/></div><div><h2>ให้เรื่องของคุณเริ่มต้น</h2><p>ใส่ไอเดียหรือเพลง แล้วค่อย ๆ วางเส้นเรื่อง</p></div></div><Field label="ชื่อโปรเจกต์"><input value={active.title} maxLength={200} onChange={e => patch({ title: e.target.value })}/></Field><Field label={active.kind === 'mv' ? 'แนวคิด MV / เรื่องที่อยากเล่า' : 'เรื่องย่อ / ไอเดียตั้งต้น'}><textarea rows={5} placeholder={active.kind === 'mv' ? 'อยากให้เพลงนี้เล่าถึงอะไร? ตัวละครเริ่มจากจุดไหน และเดินทางไปถึงอะไร…' : 'เล่าไอเดีย ตัวละคร สถานที่ จุดขัดแย้ง และตอนจบที่ต้องการ…'} value={active.brief} maxLength={20000} onChange={e => patch({ brief: e.target.value })}/></Field>{active.kind === 'mv' && <Field label="เนื้อเพลง (ถ้ามี)" hint="เนื้อเพลงที่ใส่จะเป็นแหล่งอ้างอิงหลัก ปรับช่วงเวลาช็อตได้หลัง AI วางเรื่อง"><textarea rows={5} placeholder="[Intro]\n[Verse]\n[Chorus]\nวางเนื้อเพลงที่นี่…" value={active.lyrics} maxLength={30000} onChange={e => patch({ lyrics: e.target.value })}/></Field>}<div className="field-grid"><Field label="ความยาวเรื่อง (วินาที)"><input type="number" min="1" max="900" value={active.duration} disabled={!!active.audio} onChange={e => patch({ duration: Math.max(1, Math.min(900, Number(e.target.value))) }, true)}/></Field><Field label="ความยาวต่อช็อต"><select value={active.shotLength} onChange={e => patch({ shotLength: Number(e.target.value) })}>{[4, 6, 8, 10, 12].map(n => <option key={n} value={n}>{n} วินาที</option>)}</select></Field></div>{active.synopsis && <div className="synopsis"><span><Sparkles size={15}/>เรื่องย่อที่วางไว้</span><p>{active.synopsis}</p></div>}<div className="panel-footer"><button className="primary" onClick={() => setStep(1)}>ต่อไป: ตัวละคร<ArrowRight size={16}/></button></div></section><div className="editor-aside"><section className="panel audio-panel"><div className="panel-heading"><div className="panel-icon green"><AudioLines size={21}/></div><div><h2>{active.kind === 'mv' ? 'เพลงของเรื่องนี้' : 'เสียงประกอบเรื่อง'}</h2><p>ไฟล์ต้นฉบับ ไม่เปลี่ยนคาแรกเตอร์เสียง</p></div></div><div className={`dropzone ${active.audio ? 'has-file' : ''}`} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void handleAudio(e.dataTransfer.files[0]); }}><Upload size={25}/><h3>{active.audio ? active.audio.name : 'วางไฟล์เสียงที่นี่'}</h3><p>MP3 · WAV · M4A · AAC · OGG · FLAC<br />ไม่เกิน 60 MB / 15 นาที</p><button className="secondary" disabled={!!busy} onClick={() => audioInput.current?.click()}>{active.audio ? 'เปลี่ยนไฟล์เสียง' : 'เลือกไฟล์เสียง'}</button><input type="file" ref={audioInput} hidden accept=".mp3,.wav,.m4a,.aac,.ogg,.flac" onChange={e => { void handleAudio(e.target.files?.[0]); e.target.value = ''; }}/></div>{active.audio && <><div className="waveform" aria-label="รูปคลื่นเสียง">{active.waveform.map((v, i) => <span key={i} style={{ height: `${Math.max(5, v * 50)}px` }}/>)}</div><audio ref={audioRef} src={audioUrl} controls className="audio-player" onTimeUpdate={e => setPlayTime(e.currentTarget.currentTime)}/><div className="audio-stats"><span>{timecode(playTime)} / {timecode(active.duration)}</span><button className="text-button" onClick={() => patch({ audio: undefined, waveform: [] }, true)}>นำเสียงออก</button></div></>}</section><section className="hint-card"><Sparkles size={21}/><h3>ให้เพลงเล่า มากกว่าให้ภาพสวย</h3><p>บอกอารมณ์ จุดเปลี่ยน และตอนจบที่อยากได้ เรื่องจะมีทิศทางชัดขึ้นทั้งเพลง</p><span>เสียงและภาพจะถูกส่งให้ Gemini เมื่อคุณกดสร้างเรื่องและยืนยันเท่านั้น</span></section></div></div>}
 {step === 1 && <section className="panel"><div className="panel-heading spread"><div className="inline"><div className="panel-icon green"><Users size={21}/></div><div><h2>ตัวละครเดียวกัน ตลอดเรื่อง</h2><p>ใช้ภาพต้นฉบับเป็นตัวตนหลัก เก็บมุมหน้า ด้านข้าง หรือด้านหลังที่ตรวจแล้ว</p></div></div><button className="primary" disabled={active.characters.length >= 12} onClick={() => setCharModal({ id: uid(), name: '', role: 'ตัวละครหลัก', description: '', outfit: '', locked: false, references: [] })}><Plus size={17}/>เพิ่มตัวละคร</button></div><div className="identity-banner"><ShieldCheck size={22}/><div><strong>ล็อกตัวตนจากภาพต้นแบบ</strong><p>ห้ามสร้างใบหน้าใหม่ สลับหน้า เปลี่ยนอวัยวะ หรือใช้ AI ซ่อมใบหน้า หากช็อตรักษาหน้าไม่ได้ ให้เปลี่ยนมุมกล้องหรือใช้ภาพแทรก</p></div></div>{active.characters.length ? <div className="character-grid">{active.characters.map(c => <article className="character-card" key={c.id}><div className="character-portrait">{c.references[0] ? <Media asset={c.references[0]}/> : <Users size={42}/>}<Tag tone={c.locked ? 'green' : 'gray'}>{c.locked ? <LockKeyhole size={12}/> : <UnlockKeyhole size={12}/>} {c.locked ? 'ล็อกต้นแบบแล้ว' : 'ยังไม่ล็อก'}</Tag></div><h3>{c.name}</h3><p>{c.role}</p><div className="reference-count"><ImagePlus size={14}/>{c.references.length} ภาพต้นแบบ</div><div className="button-row"><button className="secondary" onClick={() => setCharModal(c)}>{c.locked ? 'ดูต้นแบบ' : 'แก้ไข'}</button><button className="icon-btn" title="ลบตัวละคร" onClick={() => { if (window.confirm(`ลบตัวละคร ${c.name}? ช็อตที่เกี่ยวข้องต้องตรวจใหม่`))
            patch({ characters: active.characters.filter(x => x.id !== c.id), scenes: active.scenes.map(s => ({ ...s, characterIds: s.characterIds.filter(id => id !== c.id) })) }, true); }}><Trash2 size={16}/></button></div></article>)}</div> : <div className="empty-state compact"><Users size={35}/><h3>ใครจะเป็นคนเล่าเรื่องของคุณ?</h3><p>เพิ่มภาพต้นแบบตัวละคร หรือข้ามได้สำหรับงานที่เล่าผ่านสถานที่และสิ่งของ</p><button className="secondary" onClick={() => setCharModal({ id: uid(), name: '', role: 'ตัวละครหลัก', description: '', outfit: '', locked: false, references: [] })}><Plus size={16}/>สร้างตัวละครแรก</button></div>}<div className="panel-footer"><span className="small-muted">การแก้ต้นแบบจะยกเลิกผลตรวจช็อตเดิม</span><button className="primary" onClick={() => setStep(2)}>ต่อไป: สไตล์ภาพ<ArrowRight size={16}/></button></div></section>}
 {step === 2 && <div className="editor-grid"><section className="panel"><div className="panel-heading"><div className="panel-icon orange"><Palette size={21}/></div><div><h2>โลกของเรื่อง จะหน้าตาแบบไหน?</h2><p>เลือกสไตล์ครั้งเดียว แล้วใช้ต่อเนื่องทั้งโปรเจกต์</p></div></div><div className="style-grid">{STYLES.map((s, i) => <button key={s} className={`style-card ${active.style === s ? 'selected' : ''} style-${i}`} disabled={active.styleLocked} onClick={() => patch({ style: s }, true)}><span className="style-swatch"><i /><i /><i /><i /></span><strong>{s}</strong>{active.style === s && <CheckCircle2 size={16}/>}</button>)}</div><Field label="บันทึกสไตล์ / สี / แสง / อารมณ์"><textarea rows={4} disabled={active.styleLocked} value={active.styleNotes} placeholder="เช่น ส้มอุ่น เทาอ่อน เขียวพาสเทล แสงยามเช้า กล้องเคลื่อนช้า…" onChange={e => patch({ styleNotes: e.target.value }, true)}/></Field><Field label="อัตราส่วนภาพ"><div className="ratio-options">{['16:9', '9:16', '1:1'].map(r => <button type="button" key={r} disabled={active.styleLocked} className={active.ratio === r ? 'selected' : ''} onClick={() => patch({ ratio: r }, true)}><span style={{ aspectRatio: r.replace(':', ' / '), height: r === '9:16' ? 30 : 22 }}/>{r}</button>)}</div></Field><div className="panel-footer"><span className="small-muted">สไตล์ใช้กับฉากและแสง ใบหน้าอ้างอิงต้องคงเดิม</span><button className={active.styleLocked ? 'secondary' : 'primary'} onClick={() => patch({ styleLocked: !active.styleLocked }, true)}>{active.styleLocked ? <UnlockKeyhole size={16}/> : <LockKeyhole size={16}/>} {active.styleLocked ? 'ปลดล็อกเพื่อแก้ไข' : 'ล็อกสไตล์นี้'}</button></div></section><section className="panel generate-panel"><div className="ai-badge"><Sparkles size={27}/></div><h2>พร้อมให้เรื่องก่อตัว</h2><p>Gemini จะช่วยฟังอารมณ์เพลง วางเส้นเรื่อง และแบ่งช็อตตามเวลาที่กำหนด</p><div className="readiness"><div><CheckCircle2 size={16}/><span>{active.audio ? 'มีไฟล์เสียงแล้ว' : active.brief || active.lyrics ? 'มีไอเดียตั้งต้นแล้ว' : 'ยังไม่มีเสียงหรือไอเดีย'}</span></div><div><Users size={16}/><span>{active.characters.length} ตัวละคร · {active.characters.filter(c => c.locked).length} ล็อกแล้ว</span></div><div><Palette size={16}/><span>{active.style} {active.styleLocked ? '· ล็อกแล้ว' : '· ยังไม่ล็อก'}</span></div><div><Film size={16}/><span>ประมาณ {Math.min(150, Math.ceil(active.duration / active.shotLength))} ช็อต · {timecode(active.duration)}</span></div></div><label className="consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/><span>ส่งเรื่อง เพลง และภาพต้นแบบที่เลือกให้ Gemini เพื่อวิเคราะห์และวางเรื่อง<small>โควตาฟรีมีข้อจำกัด และ Google อาจใช้ข้อมูลเพื่อปรับปรุงบริการ</small></span></label>{generationError?.projectId === active.id && <GenerationError message={generationError.message} retryAfter={generationError.retryAfter} busy={!!busy} onRetry={()=>void generate()} onSettings={()=>setShowSettings(true)}/>}<button className="primary full" disabled={!!busy || !active.styleLocked || (!active.brief && !active.lyrics && !active.audio) || !consent} onClick={() => void generate()}><WandSparkles size={18}/>{config?.connected ? 'สร้างเรื่องและสตอรีบอร์ด' : 'ตั้งค่าการเชื่อมต่อ Gemini'}</button><small>การสร้างภาพและคลิปใช้เครื่องมือและเครดิตแยกต่างหาก</small><button className="text-button center" onClick={() => setStep(3)}>วางช็อตด้วยตัวเอง<ArrowRight size={14}/></button></section></div>}
 {step === 3 && <><div className="board-heading"><div><h2>เรื่องราว ทีละช็อต</h2><p>{active.scenes.length} ช็อต <span>·</span> รวม {timecode(active.scenes.reduce((n, s) => n + s.duration, 0))} <span>·</span> ตรวจผ่าน {approved}/{active.scenes.length}</p></div><div className="button-row"><button className="secondary" onClick={addScene} disabled={active.scenes.length >= 150}><Plus size={16}/>เพิ่มช็อต</button><button className="primary" disabled={!!busy} onClick={() => { setStep(2); }}>ให้ AI วางเรื่อง<Sparkles size={16}/></button></div></div>{active.synopsis && <div className="story-strip"><Sparkles size={18}/><p>{active.synopsis}</p></div>}{active.scenes.length ? <><div className="timeline-strip">{timeline(active.scenes).map((s, i) => <button key={s.id} style={{ flex: s.duration }} className={s.review === 'approved' ? 'approved' : ''} title={`${s.title} ${timecode(s.start)}–${timecode(s.end)}`} onClick={() => setSelectedScene(s.id)}><span>{String(i + 1).padStart(2, '0')}</span></button>)}</div><div className="scene-grid">{timeline(active.scenes).map((s, i) => <article className="scene-card" key={s.id}><button className="scene-thumbnail" onClick={() => setSelectedScene(s.id)}>{s.media ? <Media asset={s.media}/> : <div className="empty-scene-art"><Film size={31}/><span>เพิ่มภาพหรือคลิปช็อต</span></div>}<span className="scene-number">{String(i + 1).padStart(2, '0')}</span><span className="scene-duration">{s.duration} s</span>{s.media?.type.startsWith('video/') && <span className="scene-play"><Play size={18}/></span>}</button><div className="scene-card-body"><div className="scene-card-line"><Tag tone={s.review === 'approved' ? 'green' : s.review === 'rejected' ? 'orange' : 'gray'}>{s.review === 'approved' ? <CheckCircle2 size={11}/> : null}{s.review === 'approved' ? 'ตรวจผ่าน' : s.review === 'rejected' ? 'ต้องแก้' : 'รอตรวจ'}</Tag><span>{timecode(s.start)}–{timecode(s.end)}</span></div><button className="scene-title" onClick={() => setSelectedScene(s.id)}>{s.title}</button><p>{s.description || 'เพิ่มรายละเอียดภาพและการเล่าเรื่อง'}</p><div className="scene-card-bottom"><span>{s.section || 'ช็อตอิสระ'}</span><button className="text-button" onClick={() => setSelectedScene(s.id)}>รายละเอียด<ArrowRight size={13}/></button></div></div></article>)}</div></> : <div className="panel empty-state"><ListVideo size={36}/><h3>กระดานเรื่องราว พร้อมแล้ว</h3><p>ให้ Gemini วางเรื่อง หรือเพิ่มช็อตและเขียนรายละเอียดเอง</p><div className="button-row"><button className="primary" onClick={() => setStep(2)}><Sparkles size={17}/>สร้างด้วย Gemini</button><button className="secondary" onClick={addScene}><Plus size={17}/>เพิ่มช็อตแรก</button></div></div>}</>}
 {step === 4 && <div className="editor-grid"><section className="panel"><div className="panel-heading"><div className="panel-icon green"><Download size={21}/></div><div><h2>ส่งเรื่องของคุณ ออกไปสร้างต่อ</h2><p>เก็บข้อมูลครบ พร้อมใช้กับเครื่องมือภาพและวิดีโอ</p></div></div><div className="export-options"><button onClick={() => exportText('csv')} disabled={!active.scenes.length}><span className="export-icon orange"><ListVideo size={23}/></span><div><h3>ตารางช็อตและ Prompt</h3><p>CSV · เวลา กล้อง การเคลื่อนไหว และ Prompt ครบทุกช็อต</p></div><Download size={19}/></button><button onClick={() => exportText('md')}><span className="export-icon green"><FileText size={23}/></span><div><h3>คู่มือสร้างเรื่อง</h3><p>Markdown · เรื่องย่อ ตัวละคร สไตล์ และสตอรีบอร์ด</p></div><Download size={19}/></button><button onClick={() => exportText('srt')} disabled={!active.scenes.some(s => s.dialogue)}><span className="export-icon gray"><BookOpen size={23}/></span><div><h3>คำบรรยายบทพูด</h3><p>SRT · ใช้บทพูดหรือนิทานที่ใส่ไว้ตามช่วงเวลาช็อต</p></div><Download size={19}/></button><button onClick={() => backup(active)} disabled={!!busy}><span className="export-icon orange"><FolderOpen size={23}/></span><div><h3>สำรองทั้งโปรเจกต์</h3><p>JSON · รวมเพลง ภาพต้นแบบ และไฟล์ช็อต สำหรับย้ายเครื่อง</p></div><Download size={19}/></button></div><div className="external-tools"><h3>สร้างภาพและคลิปจาก Prompt ของแต่ละช็อต</h3><p>แนบภาพต้นแบบเดิมทุกครั้ง แล้วนำไฟล์ที่ได้กลับมาตรวจในสตอรีบอร์ด</p><div className="button-row"><a className="secondary" href="https://labs.google/fx/tools/flow" target="_blank" rel="noreferrer">Google Flow ↗</a><a className="secondary" href="https://klingai.com" target="_blank" rel="noreferrer">Kling ↗</a></div></div></section><section className="panel video-export"><div className="render-art"><Film size={49}/><span><Check size={17}/></span></div><h2>ประกอบเป็นวิดีโอ</h2><p>รวมภาพหรือคลิปที่ตรวจผ่านกับเพลงต้นฉบับ โดยคงภาพใบหน้าที่นำเข้า</p><div className="progress-track"><span style={{ width: `${active.scenes.length ? approved / active.scenes.length * 100 : 0}%` }}/></div><div className="render-meta"><span>ช็อตที่ตรวจผ่าน</span><strong>{approved} / {active.scenes.length}</strong></div><div className="export-checks">{exportProblems(active).slice(0, 5).map(t => <p key={t}><span />{t}</p>)}{!exportProblems(active).length && <p className="success-text"><CheckCircle2 size={15}/>พร้อมส่งออกแล้ว</p>}</div><button className="primary full" disabled={!!busy || !!exportProblems(active).length} onClick={() => void exportVideo()}><Film size={17}/>ส่งออกวิดีโอ</button><small>ใช้เวลาเท่าความยาวเรื่อง · รองรับ WebM หรือ MP4 ตามเบราว์เซอร์<br />คลิปที่สั้นกว่าช็อตจะค้างเฟรมสุดท้าย เสียงคลิปถูกปิดเพื่อใช้เสียงหลัก</small></section></div>}
 </main>}<footer className="workspace-footer">เล่าเรื่อง Studio <span>ทุกจินตนาการ เล่าเป็นภาพได้</span><span>v1.3.1{staticMode ? " · GitHub Pages" : ""}</span></footer></div>
 <input ref={importInput} type="file" hidden accept=".json" onChange={handleImport}/>
 {notice && <div role="status" className="toast"><span>{notice}</span><button className="icon-btn" aria-label="ปิดข้อความ" onClick={() => setNotice('')}><X size={16}/></button></div>}
 {busy && <div className="busy-bar" role="status"><Loader2 size={18} className="spin"/><span>{busy}{renderProgress > 0 ? ` · ${renderProgress}%` : ''}</span>{abort.current && <button onClick={() => abort.current?.abort()}>ยกเลิก</button>}</div>}
 {showCreate && <Modal message={notice} title="เริ่มเรื่องใหม่ของคุณ" onClose={() => setShowCreate(false)}><p className="modal-intro">เลือกประเภทงาน แล้วตั้งชื่อให้เรื่องแรก</p><div className="create-types">{(Object.keys(KINDS) as Kind[]).map(k => <button key={k} className={createKind === k ? 'selected' : ''} onClick={() => setCreateKind(k)}><KindIcon kind={k} size={25}/>{KINDS[k].name}{createKind === k && <Check size={14}/>}</button>)}</div><Field label="ชื่อเรื่อง / ชื่อเพลง"><input autoFocus value={createTitle} maxLength={200} placeholder="เรื่องราวที่อยากเล่า…" onChange={e => setCreateTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && createTitle.trim())
        void add(newProject(createKind, createTitle.trim())); }}/></Field><div className="modal-actions"><button className="secondary" onClick={() => setShowCreate(false)}>ไว้ก่อน</button><button className="primary" disabled={!createTitle.trim()} onClick={() => void add(newProject(createKind, createTitle.trim())).catch(e => setNotice(e.message))}>สร้างโปรเจกต์<ArrowRight size={16}/></button></div></Modal>}
 {showSettings && <Modal message={notice} title="การเชื่อมต่อ Gemini" onClose={() => setShowSettings(false)}><GeminiSettings config={config} configError={configError} onRefresh={refreshConfig} onNotice={setNotice}/></Modal>}
 {charModal && <Modal message={notice} title={charModal.locked ? `ต้นแบบ: ${charModal.name}` : 'ตั้งค่าตัวละคร'} onClose={() => setCharModal(null)} wide><div className="character-modal-grid"><div><div className="reference-grid">{charModal.references.map((r, i) => <div className="reference-frame" key={r.id}><Media asset={r}/><span>ต้นแบบ {i + 1}</span>{!charModal.locked && <button aria-label="นำภาพออก" className="icon-btn" onClick={() => setCharModal({ ...charModal, references: charModal.references.filter(x => x.id !== r.id) })}><X size={14}/></button>}</div>)}</div>{!charModal.locked && <label className="reference-upload"><ImagePlus size={22}/><strong>เพิ่มภาพต้นแบบ</strong><span>JPG / PNG / WebP · ไม่เกิน 4 ภาพ</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e => { void addReferences(e.target.files); e.target.value = ''; }}/></label>}<p className="small-muted">ภาพต้นฉบับเก็บไว้ครบพร้อมค่า SHA-256 เพื่อระบุไฟล์อ้างอิง ห้ามใช้ภาพที่สร้างแล้วแทนต้นแบบเดิม</p></div><div><Field label="ชื่อตัวละคร"><input disabled={charModal.locked} value={charModal.name} maxLength={100} onChange={e => setCharModal({ ...charModal, name: e.target.value })}/></Field><Field label="บทบาท"><input disabled={charModal.locked} value={charModal.role} onChange={e => setCharModal({ ...charModal, role: e.target.value })}/></Field><Field label="ลักษณะคงที่ตามภาพต้นแบบ" hint="บรรยายสิ่งที่มีอยู่จริงในภาพ ไม่สั่งเปลี่ยนอวัยวะหรือสัดส่วนใบหน้า"><textarea disabled={charModal.locked} rows={3} value={charModal.description} maxLength={3000} onChange={e => setCharModal({ ...charModal, description: e.target.value })}/></Field><Field label="ชุดและทรงผมคงที่"><textarea rows={2} disabled={charModal.locked} value={charModal.outfit} onChange={e => setCharModal({ ...charModal, outfit: e.target.value })}/></Field>{charModal.locked ? <button className="secondary" onClick={() => { setCharModal({ ...charModal, locked: false }); }}><UnlockKeyhole size={16}/>ปลดล็อกเพื่อแก้ต้นแบบ</button> : <label className="lock-checkbox"><input type="checkbox" checked={charModal.locked} disabled={!charModal.references.length} onChange={e => setCharModal({ ...charModal, locked: e.target.checked })}/><span><LockKeyhole size={16}/>ล็อกภาพต้นแบบและข้อมูลนี้</span></label>}</div></div><div className="modal-actions"><span className="small-muted">การแก้ข้อมูลจะทำให้ทุกช็อตต้องตรวจใหม่</span><button className="primary" disabled={!charModal.name.trim() || !!busy} onClick={() => void saveCharacter()}>บันทึกตัวละคร<Check size={16}/></button></div></Modal>}
 {active && scene && <Modal message={notice} title={`ช็อต ${active.scenes.findIndex(s => s.id === scene.id) + 1} · ${scene.title}`} onClose={() => setSelectedScene(null)} wide><div className="shot-modal-grid"><div><div className="shot-preview">{scene.media ? <Media asset={scene.media} controls/> : <div><Film size={40}/><p>เพิ่มภาพเริ่มหรือคลิปของช็อตนี้</p></div>}</div><label className="secondary full file-button"><ImagePlus size={16}/>{scene.media ? 'เปลี่ยนภาพหรือคลิป' : 'เพิ่มภาพหรือคลิป'}<input type="file" hidden accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={e => { void attachScene(e.target.files?.[0], scene.id); e.target.value = ''; }}/></label><div className="shot-review"><h3><ShieldCheck size={17}/>ตรวจความต่อเนื่อง</h3>{CHECKS.map(c => <label key={c}><input type="checkbox" checked={scene.checked.includes(c)} onChange={e => patchScene(scene.id, { checked: e.target.checked ? [...scene.checked, c] : scene.checked.filter(x => x !== c), review: 'pending' }, false)}/><span>{c}</span></label>)}<p>การตรวจนี้อาศัยคุณเทียบกับต้นแบบ ไม่ใช่ระบบยืนยันใบหน้าอัตโนมัติ</p><div className="button-row"><button className="primary" disabled={!scene.media || !active.styleLocked || !CHECKS.every(c => scene.checked.includes(c)) || active.characters.some(c => !c.locked)} onClick={() => patchScene(scene.id, { review: 'approved' }, false)}><CheckCircle2 size={15}/>ตรวจผ่าน</button><button className="secondary" onClick={() => patchScene(scene.id, { review: 'rejected' }, false)}>ต้องแก้</button></div></div><div className="button-row scene-order"><button className="secondary" onClick={() => moveScene(scene.id, -1)}>เลื่อนขึ้น</button><button className="secondary" onClick={() => moveScene(scene.id, 1)}>เลื่อนลง</button><button className="icon-btn" aria-label="ลบช็อต" onClick={() => { if (window.confirm('ลบช็อตนี้?')) {
        patch({ scenes: active.scenes.filter(s => s.id !== scene.id) });
        setSelectedScene(null);
    } }}><Trash2 size={17}/></button></div></div><div className="shot-fields"><div className="field-grid"><Field label="ชื่อช็อต"><input value={scene.title} onChange={e => patchScene(scene.id, { title: e.target.value })}/></Field><Field label="ความยาว (วินาที)"><input type="number" min="1" max="60" step="0.1" value={scene.duration} onChange={e => patchScene(scene.id, { duration: Math.max(1, Math.min(60, Number(e.target.value))) })}/></Field></div><Field label="ท่อนเพลง / ช่วงเรื่อง"><input value={scene.section} onChange={e => patchScene(scene.id, { section: e.target.value })}/></Field><Field label="ภาพและเหตุการณ์"><textarea rows={3} value={scene.description} onChange={e => patchScene(scene.id, { description: e.target.value })}/></Field><div className="field-grid"><Field label="กล้อง"><input value={scene.camera} onChange={e => patchScene(scene.id, { camera: e.target.value })}/></Field><Field label="การเคลื่อนไหว"><input value={scene.motion} onChange={e => patchScene(scene.id, { motion: e.target.value })}/></Field></div><Field label="ตัวละครในช็อต"><div className="cast-select">{active.characters.length ? active.characters.map(c => <label key={c.id}><input type="checkbox" checked={scene.characterIds.includes(c.id)} onChange={e => patchScene(scene.id, { characterIds: e.target.checked ? [...scene.characterIds, c.id] : scene.characterIds.filter(id => id !== c.id) })}/>{c.name}</label>) : <small>ไม่มีตัวละคร — ใช้ภาพสถานที่และสิ่งของ</small>}</div></Field>{active.kind !== 'mv' && <Field label="บทพูด / เสียงบรรยาย"><textarea rows={2} value={scene.dialogue} onChange={e => patchScene(scene.id, { dialogue: e.target.value })}/></Field>}<details className="prompt-details" open><summary><Sparkles size={15}/>Prompt สำหรับสร้างภาพและคลิป</summary>{(['image', 'video', 'negative'] as const).map(k => <div className="prompt-box" key={k}><div><strong>{k === 'image' ? 'ภาพเริ่มต้น' : k === 'video' ? 'วิดีโอจากภาพเริ่ม' : 'Negative Prompt'}</strong><button className="text-button" onClick={() => void copy(prompts(active, scene)[k])}><Copy size={13}/>คัดลอก</button></div><textarea readOnly aria-label={`Prompt ${k}`} value={prompts(active, scene)[k]} rows={k === 'negative' ? 2 : 5}/></div>)}</details><details className="prompt-details"><summary>แก้คำสั่งเพิ่มเติมของช็อต</summary><Field label="คำสั่งภาพเพิ่มเติม"><textarea rows={3} value={scene.imagePrompt} onChange={e => patchScene(scene.id, { imagePrompt: e.target.value })}/></Field><Field label="คำสั่งวิดีโอเพิ่มเติม"><textarea rows={3} value={scene.videoPrompt} onChange={e => patchScene(scene.id, { videoPrompt: e.target.value })}/></Field></details></div></div><div className="modal-actions"><span className="small-muted">ใช้ต้นแบบเดิมและภาพเริ่มที่ตรวจผ่านทุกครั้ง</span><button className="primary" onClick={() => setSelectedScene(null)}>เรียบร้อย<Check size={16}/></button></div></Modal>}
 {confirmReplace && <Modal message={notice} title="สร้างสตอรีบอร์ดใหม่" onClose={() => setConfirmReplace(false)}><p className="modal-intro">สตอรีบอร์ดเดิมและไฟล์ช็อตในโปรเจกต์นี้จะถูกแทนที่ ควรสำรองโปรเจกต์ก่อนสร้างใหม่</p><div className="modal-actions"><button className="secondary" onClick={() => setConfirmReplace(false)}>กลับไปสำรอง</button><button className="primary" onClick={() => void generate()}>สร้างใหม่</button></div></Modal>}
 </div>;
}
