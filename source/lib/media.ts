import type { Project } from './story';
import { exportProblems, timeline } from './story';
export async function analyzeAudio(blob: Blob) { const ctx = new AudioContext(); try {
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    const channel = buffer.getChannelData(0);
    const count = 100;
    const block = Math.floor(channel.length / count);
    const waveform = Array.from({ length: count }, (_, i) => { let peak = 0; for (let j = i * block; j < (i + 1) * block; j += 64)
        peak = Math.max(peak, Math.abs(channel[j])); return peak; });
    return { duration: Math.round(buffer.duration * 100) / 100, waveform };
}
finally {
    await ctx.close();
} }
export async function compressAudio(blob: Blob): Promise<Blob> { const context = new AudioContext(); try {
    const source = await context.decodeAudioData(await blob.arrayBuffer());
    const offline = new OfflineAudioContext(1, Math.ceil(source.duration * 16000), 16000);
    const node = offline.createBufferSource();
    node.buffer = source;
    node.connect(offline.destination);
    node.start();
    const result = await offline.startRendering();
    const samples = result.getChannelData(0);
    const data = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(data);
    const str = (offset: number, text: string) => Array.from(text).forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
    str(0, 'RIFF');
    view.setUint32(4, data.byteLength - 8, true);
    str(8, 'WAVE');
    str(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true);
    view.setUint32(28, 32000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    str(36, 'data');
    view.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++)
        view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * (samples[i] < 0 ? 32768 : 32767), true);
    return new Blob([data], { type: 'audio/wav' });
}
finally {
    await context.close();
} }
export function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
export async function renderVideo(p: Project, onProgress: (n: number) => void, signal: AbortSignal): Promise<{
    blob: Blob;
    extension: string;
}> { const issues = exportProblems(p); if (issues.length)
    throw new Error(issues[0]); if (!('MediaRecorder' in window))
    throw new Error('เบราว์เซอร์นี้ยังไม่รองรับส่งออกวิดีโอ กรุณาใช้ Chrome บนคอมพิวเตอร์'); const canvas = document.createElement('canvas'); const [w, h] = p.ratio === '9:16' ? [720, 1280] : p.ratio === '1:1' ? [960, 960] : [1280, 720]; canvas.width = w; canvas.height = h; const ctx = canvas.getContext('2d')!; const stream = canvas.captureStream(24); const ac = new AudioContext(); let audioSource: AudioBufferSourceNode | undefined; let recorder: MediaRecorder | undefined; let raf = 0; const urls: string[] = []; const videos: HTMLVideoElement[] = []; let loaded: (HTMLVideoElement | HTMLImageElement)[] = []; try {
    loaded = await Promise.all(p.scenes.map(async (s) => { const u = URL.createObjectURL(s.media!.blob); urls.push(u); if (s.media!.type.startsWith('video/')) {
        const v = document.createElement('video');
        v.src = u;
        v.muted = true;
        v.playsInline = true;
        v.preload = 'auto';
        videos.push(v);
        await new Promise<void>((resolve, reject) => { v.onloadeddata = () => resolve(); v.onerror = () => reject(new Error(`อ่านคลิป ${s.title} ไม่ได้`)); v.load(); });
        return v;
    } const img = new Image(); img.src = u; await img.decode(); return img; }));
    await ac.resume();
    if (p.audio) {
        const b = await ac.decodeAudioData(await p.audio.blob.arrayBuffer());
        audioSource = ac.createBufferSource();
        audioSource.buffer = b;
        const dest = ac.createMediaStreamDestination();
        audioSource.connect(dest);
        for (const track of dest.stream.getAudioTracks())
            stream.addTrack(track);
    }
    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(m => MediaRecorder.isTypeSupported(m));
    if (!mime)
        throw new Error('เบราว์เซอร์นี้ไม่มีรูปแบบวิดีโอที่ส่งออกได้');
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4000000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = e => { if (e.data.size)
        chunks.push(e.data); };
    const ended = new Promise<Blob>((resolve, reject) => { recorder!.onstop = () => resolve(new Blob(chunks, { type: mime })); recorder!.onerror = () => reject(new Error('ส่งออกวิดีโอไม่สำเร็จ')); });
    const shots = timeline(p.scenes);
    const total = shots[shots.length - 1].end;
    const started = performance.now();
    let current = -1;
    const draw = () => { const seconds = (performance.now() - started) / 1000; let index = shots.findIndex(s => seconds < s.end); if (index < 0)
        index = shots.length - 1; const media = loaded[index]; if (current !== index) {
        videos.forEach(v => v.pause());
        if (media instanceof HTMLVideoElement) {
            media.currentTime = 0;
            void media.play().catch(() => { });
        }
        current = index;
    } ctx.fillStyle = '#252b28'; ctx.fillRect(0, 0, w, h); const mw = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth; const mh = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight; if (mw && mh) {
        const scale = Math.min(w / mw, h / mh);
        ctx.drawImage(media, (w - mw * scale) / 2, (h - mh * scale) / 2, mw * scale, mh * scale);
    } onProgress(Math.min(100, Math.floor(seconds / total * 100))); if (signal.aborted || seconds >= total) {
        if (recorder!.state !== 'inactive')
            recorder!.stop();
        return;
    } raf = requestAnimationFrame(draw); };
    draw();
    recorder.start(500);
    audioSource?.start();
    const stop = () => { cancelAnimationFrame(raf); if (recorder!.state !== 'inactive')
        recorder!.stop(); };
    signal.addEventListener('abort', stop, { once: true });
    const blob = await ended;
    signal.removeEventListener('abort', stop);
    if (signal.aborted)
        throw new Error('ยกเลิกการส่งออกแล้ว');
    return { blob, extension: mime.includes('mp4') ? 'mp4' : 'webm' };
}
finally {
    cancelAnimationFrame(raf);
    videos.forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); });
    audioSource?.stop();
    stream.getTracks().forEach(t => t.stop());
    await ac.close();
    urls.forEach(u => URL.revokeObjectURL(u));
} }
