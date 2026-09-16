import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { Miniflare } from 'miniflare';

// TODO: Miniflare v5 changed outboundService API - need to update config or mock strategy
// The old API: outboundService: () => {} no longer works
// Miniflare v5 requires either config-based workers (no outboundService) or
// a different mocking strategy for outbound requests
await test.skip('Google requests work in Workers and reject redirects', async () => {
  const modules = await Promise.all(['app-error', 'google-calendar', 'guardrails'].map(async name => ({
    type: 'ESModule', path: `${name}.js`,
    contents: ts.transpileModule(await readFile(new URL(`../lib/${name}.ts`, import.meta.url), 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText.replace(/from ['"]\.\/[a-z-]+['"]/g, (match) => match.replace(/['"]/, '"').replace(/['"]$/, '.js"')),
  })));
  let requests = 0;
  const outboundHandler = async (request, miniflare) => {
    requests++;
    return requests === 1 ? Response.json({ ok: true })
      : new Response(null, { status: 302, headers: { Location: 'https://other.example' } });
  };
  const workerModules = { 'worker.js': { type: 'esm', contents: `
    import { googleFetch } from './google-calendar.js';
    export default { async fetch() {
      try { return await googleFetch('https://oauth2.googleapis.com/token', { method: 'POST' }); }
      catch (error) { return Response.json({ code: error.code }, { status: error.status || 500 }); }
    } };
  ` } };
  modules.forEach(m => {
    workerModules[m.path] = { type: 'esm', contents: m.contents };
  });


  const mf = new Miniflare({
    workers: [{
      modules: [{ type: 'ESModule', path: 'worker.js', contents: workerModules['worker.js'].contents }, ...modules],
      name: 'test-worker',
      compatibilityDate: '2024-01-01',
      outboundService: { type: 'fetcher', handler: outboundHandler },
    }],
  });
  try {
    const success = await mf.dispatchFetch('http://localhost');
    assert.equal(success.status, 200);
    assert.deepEqual(await success.json(), { ok: true });
    const redirect = await mf.dispatchFetch('http://localhost');
    assert.equal(redirect.status, 503);
    assert.deepEqual(await redirect.json(), { code: 'google_unavailable' });
    assert.equal(requests, 2);
  } finally {
    await mf.dispose();
  }
});
