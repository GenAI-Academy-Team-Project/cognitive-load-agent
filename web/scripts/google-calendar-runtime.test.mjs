import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { Miniflare } from 'miniflare';

await test('Google requests work in Workers and reject redirects', async () => {
  const modules = await Promise.all(['google-calendar', 'guardrails'].map(async name => ({
    type: 'ESModule', path: `${name}.js`,
    contents: ts.transpileModule(await readFile(new URL(`../lib/${name}.ts`, import.meta.url), 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText.replace("'./guardrails'", "'./guardrails.js'"),
  })));
  let requests = 0;
  const mf = new Miniflare({
    modules: [{ type: 'ESModule', path: 'worker.js', contents: `
      import { googleFetch } from './google-calendar.js';
      export default { async fetch() {
        try { return await googleFetch('https://oauth2.googleapis.com/token', { method: 'POST' }); }
        catch (error) { return Response.json({ code: error.code }, { status: error.status || 500 }); }
      } };
    ` }, ...modules],
    outboundService: () => {
      requests++;
      return requests === 1 ? Response.json({ ok: true })
        : new Response(null, { status: 302, headers: { Location: 'https://other.example' } });
    },
  });
  try {
    const success = await mf.dispatchFetch('http://localhost');
    assert.equal(success.status, 200);
    assert.deepEqual(await success.json(), { ok: true });
    const redirect = await mf.dispatchFetch('http://localhost');
    assert.equal(redirect.status, 503);
    assert.deepEqual(await redirect.json(), { code: 'google_unavailable' });
    assert.equal(requests, 2);
  } finally { await mf.dispose(); }
});
