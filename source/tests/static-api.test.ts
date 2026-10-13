import test from 'node:test';
import assert from 'node:assert/strict';
import { createStaticApi } from '../lib/client-api.ts';
import { demoProject, type Project } from '../lib/story.ts';
import { makeAsset } from '../lib/storage.ts';

const sampleKey = 'test-only-key-never-a-real-credential';
type ApiResult = { connected?: boolean; error: string; retryAfter: number; retryable: boolean; scenes: { review?: string; duration: number }[] };
async function readJson(response: Response) { return await response.json() as ApiResult; }
async function connect(api: typeof fetch, key = sampleKey) {
  return api('/api/key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, model: 'gemini-3.8-flash' }) });
}
function formFor(p: Project) {
  const form = new FormData();
  const { audio, waveform, scenes, ...meta } = p;
  form.append('project', JSON.stringify({ ...meta, characters: p.characters.map(c => ({ ...c, references: c.references.map(({ blob, ...reference }) => reference) })) }));
  form.append('consent', 'yes');
  for (const c of p.characters) for (const reference of c.references) form.append(`ref-${reference.id}`, reference.blob, reference.name);
  return form;
}
function output(p: Project) { return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ synopsis: p.synopsis, scenes: p.scenes }) }] } }] }); }

test('GitHub visitor keys remain private to a tab closure and disappear on disconnect or a fresh tab', async () => {
  const api = createStaticApi(async () => Response.json({ name: 'gemini-3.8-flash' }));
  assert.equal((await readJson(await api('/api/config'))).connected, false);
  const response = await connect(api);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.ok(!(await response.text()).includes(sampleKey));
  assert.deepEqual(await readJson(await api('/api/config')), { connected: true, model: 'gemini-3.8-flash', sessionEnabled: true, source: 'browser' });
  const anotherTab = createStaticApi(async () => Response.json({}));
  assert.equal((await readJson(await anotherTab('/api/config'))).connected, false);
  await api('/api/key', { method: 'DELETE' });
  assert.equal((await readJson(await api('/api/config'))).connected, false);
});

test('failed replacement keeps a working visitor key and keys never enter Google URLs', async () => {
  const p = demoProject();
  let count = 0;
  const api = createStaticApi(async (url, init) => {
    assert.ok(!String(url).includes('key='));
    const key = new Headers(init?.headers).get('x-goog-api-key');
    if (String(url).endsWith(':generateContent')) { assert.equal(key, sampleKey); return output(p); }
    count++;
    return count === 1 ? Response.json({}) : new Response('', { status: 403 });
  });
  await connect(api);
  assert.equal((await connect(api, 'other-test-key-cannot-use-this-model')).status, 403);
  assert.equal((await api('/api/story', { method: 'POST', body: formFor(p) })).status, 200);
});

test('static storyboard sends only consented original references and keeps identity review pending', async () => {
  const p = demoProject();
  const reference = await makeAsset(new File(['unaltered original pixels'], 'original.png', { type: 'image/png' }));
  p.characters = [{ id: 'lead', name: 'นางเอก', description: 'ต้นแบบเดิม', role: 'ตัวละครหลัก', outfit: 'ชุดเดิม', locked: true, references: [reference] }];
  p.scenes[0].characterIds = ['lead'];
  const api = createStaticApi(async (url, init) => {
    if (!String(url).endsWith(':generateContent')) return Response.json({});
    const body = JSON.parse(String(init?.body));
    assert.ok(body.systemInstruction.parts[0].text.includes('No facial reconstruction'));
    const media = body.contents[0].parts.find((part: { inlineData?: unknown }) => part.inlineData);
    assert.equal(atob(media.inlineData.data), 'unaltered original pixels');
    return output(p);
  });
  await connect(api);
  const result = await api('/api/story', { method: 'POST', body: formFor(p) });
  assert.equal(result.status, 200);
  const body = await readJson(result);
  assert.equal(body.scenes[0].review, undefined);
  assert.equal(body.scenes.reduce((sum: number, scene: { duration: number }) => sum + scene.duration, 0), p.duration);
  assert.equal(await reference.blob.text(), 'unaltered original pixels');
});

test('static generation refuses missing consent, missing originals and changed reference pixels before using AI', async () => {
  const p = demoProject();
  const reference = await makeAsset(new File(['original'], 'original.png', { type: 'image/png' }));
  p.characters = [{ id: 'lead', name: 'lead', description: '', role: 'lead', outfit: '', locked: true, references: [reference] }];
  let generations = 0;
  const api = createStaticApi(async (url) => { if (String(url).endsWith(':generateContent')) generations++; return Response.json({}); });
  await connect(api);
  const noConsent = formFor(p); noConsent.delete('consent');
  assert.equal((await api('/api/story', { method: 'POST', body: noConsent })).status, 400);
  const missing = formFor(p); missing.delete(`ref-${reference.id}`);
  assert.match((await readJson(await api('/api/story', { method: 'POST', body: missing }))).error, /ต้นแบบไม่ครบ/);
  const tampered = formFor(p); tampered.set(`ref-${reference.id}`, new File(['changed'], 'original.png', { type: 'image/png' }));
  assert.match((await readJson(await api('/api/story', { method: 'POST', body: tampered }))).error, /ต้นแบบเปลี่ยน/);
  assert.equal(generations, 0);
});

test('GitHub 503 errors preserve the connection and expose a manual retry without duplicate paid requests', async () => {
  const p = demoProject(); let generations = 0;
  const api = createStaticApi(async (url) => {
    if (!String(url).endsWith(':generateContent')) return Response.json({});
    generations++; return new Response('', { status: 503, headers: { 'retry-after': '20' } });
  });
  await connect(api);
  const response = await api('/api/story', { method: 'POST', body: formFor(p) });
  assert.equal(response.status, 503);
  const error = await readJson(response);
  assert.equal(error.retryAfter, 20); assert.equal(error.retryable, true);
  assert.equal(generations, 1);
  assert.equal((await readJson(await api('/api/config'))).connected, true);
});

test('cancelling static generation aborts the upstream request', { timeout: 5000 }, async () => {
  const p = demoProject(); const controller = new AbortController();
  let reached!: () => void;
  const started = new Promise<void>(resolve => { reached = resolve; });
  const api = createStaticApi(async (url, init) => {
    if (!String(url).endsWith(':generateContent')) return Response.json({});
    return new Promise<Response>((_, reject) => {
      init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true });
      reached();
    });
  });
  await connect(api);
  const generation = api('/api/story', { method: 'POST', body: formFor(p), signal: controller.signal });
  await started; controller.abort();
  await assert.rejects(generation, { name: 'AbortError' });
});
