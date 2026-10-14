import { generateConcepts } from './planning.ts';
import { DEFAULT_MODEL, generateStory, GeminiServiceError, MAX_INPUT, validateInput } from './gemini.ts';
import { FREE_MODELS } from './models.ts';

export type GeminiConfig = {
  connected: boolean;
  model: string;
  sessionEnabled?: boolean;
  source?: 'server' | 'session' | 'browser' | null;
  serverMode?: boolean;
  klingConfigured?: boolean;
  ownerConnected?: boolean;
};

export function isStaticMode() {
  return typeof document !== 'undefined' && document.documentElement.dataset.hosting === 'github-pages';
}

function encode(bytes: Uint8Array) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  }
  return btoa(binary);
}

/** A visitor's key stays in this closure for the lifetime of this tab only. */
export function createStaticApi(fetcher: typeof fetch = fetch, options: { key?: string; model?: string; server?: boolean } = {}): typeof fetch {
  let key = options.key || '';
  let model = options.model || DEFAULT_MODEL;
  const json = (value: unknown, status = 200) => Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });

  return async (input, init) => {
    const request = input instanceof Request
      ? new Request(input, init)
      : new Request(new URL(String(input), 'https://storycraft.local'), init);
    const path = new URL(request.url).pathname;
    try {
      if (path === '/api/config' && request.method === 'GET') {
        return json({ connected: !!key, model, sessionEnabled: true, source: key ? (options.server ? 'server' : 'browser') : null, ...(options.server ? {serverMode:true} : {}) });
      }
      if (options.server && path === '/api/key') return json({error:'คีย์เก็บใน Cloudflare Secrets เปลี่ยนคีย์ที่หลังบ้านเท่านั้น'}, 405);
      if (path === '/api/key' && request.method === 'DELETE') {
        key = ''; model = DEFAULT_MODEL;
        return json({ cleared: true });
      }
      if (path === '/api/key' && request.method === 'POST') {
        const text = await request.text();
        if (text.length > 2048) return json({ error: 'ข้อมูลคีย์ใหญ่เกินไป' }, 413);
        const candidate = JSON.parse(text) as { key?: unknown; model?: unknown };
        if (typeof candidate.key !== 'string' || candidate.key.length < 20 || candidate.key.length > 512 || /\s/.test(candidate.key)) {
          return json({ error: 'รูปแบบ Gemini API key ไม่ถูกต้อง' }, 400);
        }
        if (typeof candidate.model !== 'string' || !FREE_MODELS.includes(candidate.model)) {
          return json({ error: 'เลือกโมเดลจากรายการก่อน' }, 400);
        }
        const response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${candidate.model}`, {
          headers: { 'x-goog-api-key': candidate.key },
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(15000)]),
        });
        if (!response.ok) {
          const message = response.status >= 500 ? 'Google ยังไม่พร้อมตรวจคีย์ กรุณารอแล้วเชื่อมใหม่'
            : response.status === 404 ? 'บัญชีนี้ยังใช้โมเดลที่เลือกไม่ได้ ลองเลือกรุ่นอื่น'
            : response.status === 429 ? 'เรียก Google ถี่เกินไป กรุณารอสักครู่'
            : 'Google ไม่อนุญาตคีย์นี้ กรุณาตรวจคีย์และสิทธิ์ใน Google AI Studio';
          return json({ error: message }, response.status);
        }
        key = candidate.key; model = candidate.model;
        return json({ connected: true, model, source: 'browser' });
      }
      if (!['/api/story', '/api/concepts'].includes(path) || request.method !== 'POST') return json({ error: 'ไม่พบคำสั่งนี้' }, 404);
      if (!key) return json({ error: options.server ? 'เพิ่ม GEMINI_API_KEY ใน Cloudflare Secrets ก่อน' : 'เชื่อม Gemini ของคุณก่อน คีย์จะไม่ถูกเก็บหลังรีเฟรชหรือปิดแท็บ' }, options.server ? 503 : 401);
      const form = await request.formData();
      if (form.get('consent') !== 'yes') return json({ error: 'ยืนยันส่งไฟล์ให้ Gemini ก่อนสร้างเรื่อง' }, 400);
      const raw = form.get('project');
      if (typeof raw !== 'string' || raw.length > 90000) return json({ error: 'ข้อมูลโปรเจกต์ไม่ถูกต้องหรือใหญ่เกินไป' }, 400);
      const p = validateInput(JSON.parse(raw), path === '/api/concepts');
      if (!p.brief.trim() && !p.lyrics.trim() && !form.get('audio')) return json({ error: 'ใส่เรื่องย่อ เนื้อเพลง หรือไฟล์เสียงก่อน' }, 400);
      const expected = new Map<string, { hash: string; name: string }>(p.characters.flatMap(c => c.references.map(r => [`ref-${r.id}`, r] as const)));
      const used = new Set<string>();
      const parts: { mimeType: string; data: string; name: string }[] = [];
      let total = 0;
      for (const [name, file] of form.entries()) {
        if (typeof file === 'string') continue;
        if (used.has(name)) return json({ error: 'ไฟล์อ้างอิงซ้ำ' }, 400);
        used.add(name);
        const reference = expected.get(name);
        if (name !== 'audio' && !reference) return json({ error: 'ภาพนี้ไม่ได้อยู่ในต้นแบบที่ล็อกไว้' }, 400);
        const valid = name === 'audio'
          ? ['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/flac'].includes(file.type)
          : ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
        if (!valid) return json({ error: 'ชนิดไฟล์เสียงหรือภาพต้นแบบไม่รองรับ' }, 400);
        total += file.size;
        if (total > MAX_INPUT) return json({ error: 'ไฟล์รวมใหญ่เกิน 14 MB กรุณาลดขนาดเสียง โดยคงภาพต้นแบบเดิม' }, 413);
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (reference) {
          const digest = await crypto.subtle.digest('SHA-256', bytes);
          const hash = Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, '0')).join('');
          if (hash !== reference.hash) return json({ error: 'ไฟล์ต้นแบบเปลี่ยนจากภาพที่ล็อกไว้' }, 400);
        }
        parts.push({ mimeType: file.type, data: encode(bytes), name: reference ? `CHARACTER REFERENCE ${reference.name}` : file.name });
      }
      if ([...expected.keys()].some(id => !used.has(id))) return json({ error: 'ส่งภาพต้นแบบไม่ครบ กรุณาใช้ต้นแบบเดิมทุกภาพ' }, 400);
      if (path === '/api/concepts') return json({ concepts: await generateConcepts(p, parts, key, model, fetcher, AbortSignal.any([request.signal, AbortSignal.timeout(150000)])) });
      const result = await generateStory(p, parts, key, model, fetcher, AbortSignal.any([request.signal, AbortSignal.timeout(150000)]));
      return json({ synopsis: result.synopsis, scenes: result.scenes.map(({ id, review, checked, ...scene }) => scene) });
    } catch (error) {
      if (request.signal.aborted) throw request.signal.reason || error;
      if (error instanceof GeminiServiceError) return json({ error: error.message, retryAfter: error.retryAfter, retryable: true }, error.status);
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        return json({ error: 'Google ใช้เวลานานเกินไป กรุณารอแล้วลองใหม่' }, 504);
      }
      if (error instanceof TypeError) return json({ error: 'เชื่อม Google ไม่ได้ กรุณาตรวจอินเทอร์เน็ตและการอนุญาต API ของบัญชี' }, 502);
      return json({ error: error instanceof Error ? error.message : 'ไม่สามารถสร้างสตอรีบอร์ดได้' }, 400);
    }
  };
}

