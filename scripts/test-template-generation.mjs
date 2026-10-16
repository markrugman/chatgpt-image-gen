// Optional live integration. Uses copied media/auth in a disposable workspace; never edits the source.
// node scripts/test-template-generation.mjs <cached-workspace.json> <bundled-codex.exe> <app-auth.json>
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
const [sourcePath, runtime, auth] = process.argv.slice(2);
assert(sourcePath && runtime && auth, 'Supply source workspace, bundled runtime and app auth file');
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8')).workspace;
const design = source.documents.find(d => d.name === 'Flat Vector');
assert(design, 'Select a source workspace containing the motivating Flat Vector design');
const sourcePage = design.pages[0];
const originalRefs = sourcePage.messages.find(m => m.role === 'user' && m.references.length >= 2).references.slice(0, 2);
const refImages = originalRefs.map(r => r.startsWith('image:') ? r.slice(6) : source.assets.flatMap(a => a.versions).find(v => v.id === r).imageId);
const exampleId = sourcePage.history[sourcePage.historyIndex].imageId;
const imagePath = id => path.join(path.dirname(sourcePath), 'media', source.images.find(i => i.id === id).file);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'imagegen-template-live-'));
const home = path.join(root, 'private-runtime'); fs.mkdirSync(home);
fs.copyFileSync(auth, path.join(home, 'auth.json'));
fs.writeFileSync(path.join(home, 'config.toml'), 'cli_auth_credentials_store="file"\nforced_login_method="chatgpt"\n');
const port = await new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const url = `http://127.0.0.1:${port}`;
const env = { ...process.env, IMAGEGEN_SERVER_DATA: root, IMAGEGEN_SERVER_LISTEN: `127.0.0.1:${port}`, IMAGEGEN_WEB_DIR: path.resolve('dist'), IMAGEGEN_WORKER_DATA: path.join(root, 'worker'), IMAGEGEN_WORKER_ENABLED: 'true', IMAGEGEN_CODEX_PATH: path.resolve(runtime), CODEX_HOME: home };
for (const key of ['OPENAI_API_KEY','CODEX_API_KEY','CODEX_ACCESS_TOKEN']) delete env[key];
let service, browser;
const headers = { 'X-Imagegen-Request': '1' };
try {
  service = spawn(path.resolve('server/target/debug/image-gen-server.exe'), [], { windowsHide: true, env, stdio: 'ignore' });
  for (let i=0;i<100;i++) { try { if ((await fetch(url+'/health')).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext();
  const post = async (command, data = {}) => { const r = await context.request.post(url+'/api/'+command, { headers, data, timeout: 120000 }); assert(r.ok(), `${command}: ${await r.text()}`); return r.json(); };
  const act = async action => post('mutate', { action: { ...action, _base: await post('get_workspace') } });
  const key = fs.readFileSync(path.join(root,'server-access-key'),'utf8').trim();
  assert((await context.request.post(url+'/web/login', { headers, data: { accessKey: key, remember: true } })).ok());
  assert((await context.request.post(url+'/web/owner', { headers, data: { keyOnly: true } })).ok());
  const connection = await post('connection'); assert.equal(connection.account?.type, 'chatgpt');
  console.log('PASS managed ChatGPT account in isolated runtime');
  const org = await act({ op: 'organisation', name: 'Templates live acceptance' });
  const project = await act({ op: 'project', name: 'Disposable avatars', organisationId: org });
  const imported = [];
  for (const [i,id] of [...refImages, exampleId].entries()) {
    imported.push(await post('import_asset_data', { name: i < 2 ? `Subject ${i+1}` : 'Example', data: fs.readFileSync(imagePath(id)).toString('base64'), organisationId: org, replaceId: null }));
  }
  let w = await post('get_workspace');
  const versions = imported.map(id => w.assets.find(a => a.id === id).currentVersionId);
  const exampleImageId = w.assets.find(a => a.id === imported[2]).versions[0].imageId;
  const doc = await act({ op: 'document', name: 'Template reference acceptance', projectId: project, width: 1080, height: 1080, unit: 'px' });
  const templateId = await act({ op: 'template_save', name: 'Flat vector acceptance', recipe: 'Create a clean flat vector avatar of the person shown in the Subject references. Use a shoulders-up composition, clear outlines and a limited colour palette. Place the head on a pale-blue circular background. Follow the Style reference for illustration technique only; preserve the Subject likeness, hairstyle and facial hair.', exampleImageId, organisationId: org, tags: ['avatar'], usageNotes: 'Attach two Subject photographs of the same person.' });
  w = await post('get_workspace');
  const pageId = w.documents.find(d => d.id === doc).pages[0].id;
  const target = { kind: 'document', id: doc, pageId };
  const template = w.templates.find(t => t.id === templateId);
  const request = { target, template, prompt: 'Use a navy circle background instead of pale blue. Keep the subject recognisable. Do not add text.', mode: 'generate', references: versions, referencePurposes: versions.map((reference,i) => ({ reference, purpose: i < 2 ? 'Subject' : 'Style', explanation: i < 2 ? 'Both Subject photographs depict the same person; use for likeness.' : 'Illustration style only, not identity.' })), transparent: false };
  const preview = await post('preview_template', { request });
  const job = await post('submit_prompt', { request: { ...request, expectedInstructions: preview.instructions } });
  console.log('Started real template generation');
  const wait = async id => {
    for (let i=0;i<450;i++) {
      const j = (await post('get_jobs')).find(j => j.id === id);
      if (j && ['completed','failed','cancelled'].includes(j.status)) { assert.equal(j.status, 'completed', j.message); return; }
      await new Promise(r => setTimeout(r, 2000));
    } throw Error('Generation timed out');
  };
  await wait(job);
  w = await post('get_workspace');
  let p = w.documents.find(d => d.id === doc).pages[0];
  assert.equal(p.revisions.length, 1);
  assert.equal(p.messages.find(m => m.templateRequest).templateRequest.instructions, preview.instructions);
  const image1 = p.revisions[0].imageId, thread = p.threadId;
  fs.mkdirSync('outputs/templates-live', { recursive: true });
  const saveImage = async (id,name) => { const data = await post('image_data', { imageId: id }); fs.writeFileSync(`outputs/templates-live/${name}.png`, Buffer.from(data.split(',')[1], 'base64')); };
  await saveImage(image1,'avatar');
  console.log('PASS live template generation with two Subject photos, Style example and navy override');
  const followup = await post('submit_prompt', { request: { target, prompt: 'Keep this avatar and navy circle. Make the illustrated outlines a little thicker. Do not add text.', mode: 'generate', references: [], transparent: false } });
  console.log('Started ordinary follow-up edit');
  await wait(followup);
  w = await post('get_workspace'); p = w.documents.find(d => d.id === doc).pages[0];
  assert.equal(p.revisions.length, 2); assert.equal(p.threadId, thread);
  assert.equal(p.revisions[1].parentRevisionId, p.revisions[0].id);
  await saveImage(p.revisions[1].imageId,'followup');
  const page = await context.newPage(); await page.goto(`${url}/#view=projects&org=${org}&design=${doc}&page=${pageId}`);
  await page.screenshot({ path: 'outputs/templates-live/editor.png', fullPage: true });
  fs.writeFileSync('outputs/templates-live/result.json', JSON.stringify({ status: 'passed', sourceWorkspaceWritten: false, generations: 2, revisionCount: p.revisions.length, sameThreadFollowup: p.threadId === thread, workspace: root, instructions: preview.instructions }, null, 2));
  console.log('PASS ordinary follow-up continues template result; earlier revision retained');
} finally {
  await browser?.close(); service?.kill();
  // Only remove the copied credential, never the source app's login.
  fs.rmSync(path.join(home, 'auth.json'), { force: true });
}
