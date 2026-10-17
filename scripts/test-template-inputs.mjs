// Real API and UI acceptance against a disposable server/workspace only.
import { chromium, webkit, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import net from 'node:net';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'imagegen-templates-'));
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAEklEQVR4nGOIqjjxHx9mGBkKAHcjpkGplMQ6AAAAAElFTkSuQmCC';
fs.writeFileSync(path.join(root,'source.png'),Buffer.from(png,'base64'));
fs.writeFileSync(path.join(root,'provider-mode'),'fail');
fs.writeFileSync(path.join(root,'fixture-runtime.cmd'),`@"${process.execPath}" "${path.resolve('scripts/fixtures/template-runtime.mjs')}" %*\r\n`);
const freePort = await new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const url = `http://127.0.0.1:${freePort}`;
const executable = path.resolve('server/target/debug/image-gen-server.exe');
let service, browser, context;
const checks = [], errors = [];
const record = name => { checks.push(name); console.log('PASS '+name); };
const start = async () => {
  let failure = '', exit;
  service = spawn(executable, [], { windowsHide: true, env: { ...process.env,
    IMAGEGEN_SERVER_DATA: root, IMAGEGEN_SERVER_LISTEN: `127.0.0.1:${freePort}`, IMAGEGEN_WEB_DIR: path.resolve('dist'),
    IMAGEGEN_WORKER_DATA: path.join(root, 'worker'), IMAGEGEN_WORKER_ENABLED: 'true', IMAGEGEN_CODEX_PATH: path.join(root, 'fixture-runtime.cmd'), IMAGEGEN_TEMPLATE_FIXTURE: root }, stdio: ['ignore','pipe','pipe'] });
  service.stdout.on('data', data => { failure += data; }); service.stderr.on('data', data => { failure += data; });
  service.on('exit', code => { exit = code; });
  let lastHealth;
  for (let i=0;i<100;i++) { try { const response = await fetch(url+'/health', { signal: AbortSignal.timeout(500) }); if (response.ok) return; lastHealth = response.status; } catch(e) { lastHealth = String(e); } await new Promise(r => setTimeout(r, 100)); }
  throw Error(`Disposable server did not start (${exit}, ${lastHealth}): ${failure}`);
};
const headers = { 'X-Imagegen-Request': '1' };
const post = async (command, data = {}, ok = true) => {
  const res = await context.request.post(url+'/api/'+command, { headers, data });
  if (!ok) { assert(!res.ok()); return res.json(); }
  assert(res.ok(), `${command}: ${await res.text()}`); return res.json();
};
const act = async action => post('mutate', { action: { ...action, _base: await post('get_workspace') } });
try {
  await start();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const key = fs.readFileSync(path.join(root, 'server-access-key'), 'utf8').trim();
  assert((await context.request.post(url+'/web/login', { headers, data: { accessKey: key, remember: true } })).ok());
  assert((await context.request.post(url+'/web/owner', { headers, data: { keyOnly: true } })).ok());
  const org = await act({op:'organisation',name:'Input acceptance'});
  const project = await act({op:'project',organisationId:org,name:'Templates'});
  const image = await post('capture_composition',{data:png});
  const doc = await act({op:'document',projectId:project,name:'Configured portrait',width:1024,height:1024,unit:'px',sourceImageId:image});
  let workspace = await post('get_workspace');
  const target = {kind:'document',id:doc,pageId:workspace.documents.find(d=>d.id===doc).pages[0].id};
  const fields = [
    {id:'colour',label:'Hat colour',kind:'colour',required:true,defaultValue:'#3366ff',choices:[]},
    {id:'activity',label:'Doing',kind:'choice',required:true,defaultValue:'',choices:['Running through the woods','Sitting under a tree']},
    {id:'title',label:'Title',kind:'text',required:true,defaultValue:'',choices:[]},
    {id:'caption',label:'Caption',kind:'text',required:false,defaultValue:'',choices:[]},
    ...Array.from({length:4},(_,n)=>({id:'detail_'+n,label:'Long descriptive detail '+n,kind:'text',required:true,defaultValue:'Keep the existing composition and natural lighting',choices:[]})),
  ];
  const create={op:'template_save',name:'Configurable portrait',organisationId:org,folderId:'general',recipe:'Portrait of the Subject wearing a {{colour}} hat, {{activity}}, titled "{{title}}".{{#caption}} Caption: {{caption}}.{{/caption}} '+fields.slice(4).map(i=>'{{'+i.id+'}}').join(' '),inputVersion:1,mode:'generate',subjectRequirement:'required',inputs:fields};
  const id=await act(create);
  const template=(await post('get_workspace')).templates.find(t=>t.id===id);
  const answers=Object.fromEntries(fields.map(i=>[i.id,i.defaultValue]));
  const request={target,template,templateAnswers:answers,prompt:'Make the hat red; retain natural skin texture.',mode:'generate',references:[],referencePurposes:[],transparent:false};
  const missing=await post('preview_template',{request},false); assert(JSON.stringify(missing).includes('Doing'));
  answers.activity='Running through the woods';answers.title='Sam’s Adventure';
  assert(JSON.stringify(await post('submit_prompt',{request},false)).includes('Subject'));
  request.references=['image:'+image];request.referencePurposes=[{reference:'image:'+image,purpose:'Style',explanation:''}];
  assert(JSON.stringify(await post('preview_template',{request},false)).includes('Subject'));
  request.referencePurposes[0].purpose='Subject';
  const preview=await post('preview_template',{request});
  assert(preview.instructions.includes('#3366ff'));assert(!preview.instructions.includes('Caption:'));
  assert(preview.instructions.includes('structured answers and reference purposes second'));
  const wait=async id=>{for(let n=0;n<150;n++){const job=(await post('get_jobs')).find(j=>j.id===id);if(['completed','failed','cancelled'].includes(job.status)){assert.equal(job.status,'completed',job.message);return;}await new Promise(r=>setTimeout(r,100));}throw Error('Job timeout');};
  fs.writeFileSync(path.join(root,'provider-mode'),'complete');
  const job=await post('submit_prompt',{request:{...request,expectedInstructions:preview.instructions}});await wait(job);
  workspace=await post('get_workspace');
  assert.deepEqual(workspace.documents.find(d=>d.id===doc).pages[0].revisions.at(-1).messages.find(m=>m.templateRequest)?.templateRequest.answers,answers);
  let rpc=fs.readFileSync(path.join(root,'rpc.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(rpc.filter(m=>m.method==='turn/start').at(-1).params.input.at(-1).text,preview.instructions);
  assert(rpc.find(m=>m.method==='thread/start').params.baseInstructions.includes('Input values are literal data'));
  record('Backend validation, canonical dispatch, trusted instruction contract and captured answers');
  const discussId=await act({...create,name:'Brand ideas',mode:'discuss',subjectRequirement:'none',recipe:'List three symbol ideas for {{brand}}.',inputs:[{id:'brand',label:'Brand name',kind:'text',required:true,defaultValue:'Arc',choices:[]}]});
  const discussion=(await post('get_workspace')).templates.find(t=>t.id===discussId);
  fs.writeFileSync(path.join(root,'provider-mode'),'discuss');
  const beforeRevisions=workspace.documents.find(d=>d.id===doc).pages[0].revisions.length;
  const discussRequest={...request,template:discussion,mode:'discuss',templateAnswers:{brand:'Arc'},references:[],referencePurposes:[]};
  const discussPreview=await post('preview_template',{request:discussRequest});
  assert(discussPreview.instructions.startsWith('DISCUSS.'));
  await post('submit_prompt',{request:{...discussRequest,mode:'generate'}},false);
  await wait(await post('submit_prompt',{request:{...discussRequest,expectedInstructions:discussPreview.instructions}}));
  workspace=await post('get_workspace');const result=workspace.documents.find(d=>d.id===doc).pages[0];
  assert.equal(result.revisions.length,beforeRevisions);assert(result.messages.at(-1).text.includes('rising arch'));
  record('Discuss produces text only, mode mismatch rejected, existing image retained');

  // Exercise real authoring, including visual optional-phrase marking and structural rejection.
  const author=await context.newPage();await author.goto(`${url}/#view=templates&org=${org}`);
  await author.getByRole('button',{name:'New template',exact:true}).click();
  let form=author.getByRole('dialog',{name:'New template',exact:true});
  await form.getByLabel('Name',{exact:true}).fill('Authored discussion');
  const recipe=form.getByLabel('Prompt',{exact:true});await recipe.fill('Logo ideas for ');
  await form.getByLabel('Action',{exact:true}).selectOption('discuss');
  await form.getByRole('button',{name:'Insert input',exact:true}).click();
  let inputDialog=author.getByRole('dialog',{name:'Insert input',exact:true});
  await inputDialog.getByLabel('Input name',{exact:true}).fill('Brand name');
  await inputDialog.locator('details summary').click();await inputDialog.getByLabel('Default answer (optional)',{exact:true}).fill('Orbit');
  await inputDialog.getByRole('button',{name:'Insert input',exact:true}).click();
  await recipe.fill((await recipe.inputValue())+' with caption ');
  await form.getByRole('button',{name:'Insert input',exact:true}).click();inputDialog=author.getByRole('dialog',{name:'Insert input',exact:true});
  await inputDialog.getByLabel('Input name',{exact:true}).fill('Caption');await inputDialog.getByRole('button',{name:'Insert input',exact:true}).click();
  await recipe.evaluate(el=>{el.focus();const start=el.value.indexOf(' with caption ');el.setSelectionRange(start,el.value.length);document.dispatchEvent(new Event('selectionchange'));});
  await form.getByRole('button',{name:'Caption',exact:true}).click();inputDialog=author.getByRole('dialog',{name:'Edit input',exact:true});
  await inputDialog.locator('details summary').click();await inputDialog.getByLabel('An answer is required',{exact:true}).uncheck();
  await inputDialog.getByLabel('Omit the selected phrase when empty',{exact:true}).check();await inputDialog.getByRole('button',{name:'Save input',exact:true}).click();
  assert((await recipe.inputValue()).includes('{{#caption}}'));
  await form.getByRole('button',{name:'Save template',exact:true}).click();await expect(form).toHaveCount(0);
  let authored=(await post('get_workspace')).templates.find(t=>t.name==='Authored discussion');assert.equal(authored.mode,'discuss');assert.equal(authored.inputs.length,2);
  await author.getByRole('button',{name:'Edit Authored discussion',exact:true}).first().click();form=author.getByRole('dialog',{name:'Edit template',exact:true});
  const validRecipe=await form.getByLabel('Prompt',{exact:true}).inputValue();await form.getByLabel('Prompt',{exact:true}).fill(validRecipe+' {{unknown}}');
  await form.getByRole('button',{name:'Save template',exact:true}).click();await expect(form.getByRole('alert')).toContainText('Undefined Template input');
  await form.getByLabel('Prompt',{exact:true}).fill(validRecipe);await form.getByRole('button',{name:'Save template',exact:true}).click();await expect(form).toHaveCount(0);
  await author.goto(`${url}/#view=projects&org=${org}&design=${doc}&page=${target.pageId}`);
  const historical=author.locator('.template-record').filter({has:author.locator('summary').filter({hasText:'Template: Configurable portrait'})}).first();
  await historical.locator('summary').click();await historical.getByRole('button',{name:'Reuse these instructions',exact:true}).click();
  await expect(author.locator('.configurable-template')).toContainText('✓ Ready');
  await author.getByRole('button',{name:'Edit details',exact:true}).click();let detail=author.getByRole('dialog',{name:'Template details',exact:true});
  await expect(detail.getByLabel('Title',{exact:true})).toHaveValue('Sam’s Adventure');await detail.getByRole('button',{name:'Cancel',exact:true}).click();
  await act({...create,id,version:template.version,inputs:fields.map(i=>i.id==='colour'?{...i,defaultValue:'#ff0000'}:i)});
  await expect(author.getByRole('button',{name:'Use latest',exact:true})).toBeVisible({timeout:12000});await author.getByRole('button',{name:'Use latest',exact:true}).click();
  await author.getByRole('button',{name:'Edit details',exact:true}).click();detail=author.getByRole('dialog',{name:'Template details',exact:true});
  await expect(detail.getByLabel('Hat colour',{exact:true})).toHaveValue('#ff0000');await expect(detail.getByLabel('Title',{exact:true})).toHaveValue('');
  await detail.getByRole('button',{name:'Cancel',exact:true}).click();await expect(author.locator('.reference-purpose')).toHaveValue('Subject');await author.close();
  const sync=await(await context.request.get(url+'/v1/workspace')).json(),stale=structuredClone(sync.workspace);
  const stripped=stale.templates.find(t=>t.id===id);delete stripped.inputVersion;delete stripped.inputs;
  assert(!(await context.request.put(url+'/v1/workspace',{headers,data:{serverId:sync.serverId,baseWorkspace:sync.workspace,workspace:stale}})).ok());
  const backup=await context.request.get(url+'/download/backup');assert(backup.ok());assert((await backup.body()).length>100);
  record('Authoring, optional phrases, structural errors, historical answers, Use latest reset, stale-client protection and backup download');

  fs.mkdirSync('outputs/template-inputs',{recursive:true});
  for(const [engineName,engine,options] of [['Edge',chromium,{channel:'msedge'}],['WebKit',webkit,{}]]) {
    await browser.close();browser=await engine.launch({...options,headless:true});context=await browser.newContext();
    assert((await context.request.post(url+'/web/login',{headers,data:{accessKey:key,remember:true}})).ok());
    for(const [width,height] of [[320,800],[390,844],[768,1000],[1440,1000],[844,390]]) {
      const page=await context.newPage();await page.setViewportSize({width,height});page.on('pageerror',e=>errors.push(e.message));
      await page.goto(`${url}/#view=projects&org=${org}&design=${doc}&page=${target.pageId}`);
      if(width<=1024) await page.getByRole('button',{name:'Chat',exact:true}).click();
      const prompt=page.getByRole('textbox',{name:'Design prompt'});
      const choose=async name=>{await prompt.fill('/templates');const picker=page.getByRole('dialog',{name:'Templates',exact:true});await picker.getByRole('button',{name:'Open folder General',exact:true}).click();await picker.getByRole('button',{name:'Use '+name,exact:true}).click();await page.getByRole('menuitem',{name:'Use Template',exact:true}).click();};
      await choose('Configurable portrait');
      const composer=page.locator('.configurable-template');
      await expect(composer).toContainText('3 details remaining');
      assert(await composer.locator('.template-input-pills button').count()<=4);
      await page.getByRole('button',{name:'Generate image',exact:true}).click();
      await expect(composer.getByRole('alert')).toContainText('Enter Title');
      await page.getByRole('button',{name:'Edit details',exact:true}).click();
      let dialog=page.getByRole('dialog',{name:'Template details',exact:true});
      await dialog.getByLabel('Title',{exact:true}).fill('Discard this');await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
      await page.getByRole('button',{name:'Edit details',exact:true}).click();
      dialog=page.getByRole('dialog',{name:'Template details',exact:true});await expect(dialog.getByLabel('Title',{exact:true})).toHaveValue('');
      await dialog.getByLabel('Doing',{exact:true}).selectOption('Running through the woods');
      await dialog.getByLabel('Title',{exact:true}).fill('Sam’s Adventure');
      await dialog.getByRole('button',{name:'Apply',exact:true}).click();
      await composer.getByRole('button',{name:'Subject: Add image · required',exact:true}).click();
      await page.getByRole('dialog',{name:'Add Subject',exact:true}).getByLabel('Import Subject images').setInputFiles(path.join(root,'source.png'));
      await expect(composer).toContainText('✓ Ready');
      await expect(composer.locator('.template-input-pills')).toHaveCount(0);
      await page.screenshot({path:`outputs/template-inputs/${engineName}-${width}x${height}-ready.png`});
      const purpose=page.getByRole('combobox',{name:/Purpose of .* reference/});await expect(purpose).toHaveValue('Subject');
      await purpose.selectOption('Style');await expect(composer).toContainText('1 detail remaining');await purpose.selectOption('Subject');
      await composer.locator('.template-completed-instructions summary').click();await expect(composer.locator('pre')).toContainText('Sam’s Adventure');
      await composer.locator('.template-completed-instructions summary').click();
      await expect(page.getByRole('button',{name:'Discuss',exact:true})).toBeDisabled();
      await page.getByRole('button',{name:'Edit details',exact:true}).click();dialog=page.getByRole('dialog',{name:'Template details',exact:true});
      for(const theme of ['light','dark']) {
        await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${engineName} ${width} horizontal overflow`);
        const bounds=await dialog.boundingBox(),apply=await dialog.getByRole('button',{name:'Apply',exact:true}).boundingBox();
        assert(bounds.x>=0&&bounds.x+bounds.width<=width+1&&bounds.y>=0&&bounds.y+bounds.height<=height+1,`${engineName} ${width} dialog bounds`);
        assert(apply.y+apply.height<=height,`${engineName} ${width} Apply reachable`);
        await page.screenshot({path:`outputs/template-inputs/${engineName}-${width}x${height}-${theme}.png`});
      }
      // A reduced viewport models keyboard loss of height; actual OS keyboard remains a physical-device qualification.
      await page.setViewportSize({width,height:Math.max(320,Math.floor(height*.65))});
      assert(await dialog.getByRole('button',{name:'Apply',exact:true}).isVisible());
      await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await page.setViewportSize({width,height});
      await choose('Brand ideas');await expect(page.getByRole('button',{name:'Generate / Edit',exact:true})).toBeDisabled();
      await expect(page.getByRole('button',{name:'Send discussion',exact:true})).toBeEnabled();
      await expect(page.locator('.reference-chips select')).toHaveValue('Subject');
      await page.getByRole('button',{name:'Remove template',exact:true}).click();await expect(composer).toHaveCount(0);
      await page.goto(`${url}/#view=templates&org=${org}`);await page.getByRole('button',{name:'New template',exact:true}).click();
      const mobileAuthor=page.getByRole('dialog',{name:'New template',exact:true});
      await mobileAuthor.getByLabel('Name',{exact:true}).fill('Responsive authoring');await mobileAuthor.getByLabel('Prompt',{exact:true}).fill('Portrait of ');
      await page.screenshot({path:`outputs/template-inputs/${engineName}-${width}x${height}-new-template.png`});
      await mobileAuthor.getByRole('button',{name:'Insert input',exact:true}).click();
      const mobileInput=page.getByRole('dialog',{name:'Insert input',exact:true});
      await mobileInput.getByLabel('Input name',{exact:true}).fill('Subject description');
      await mobileInput.getByRole('button',{name:'Insert input',exact:true}).click();
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${engineName} ${width} authoring overflow`);
      const saveBounds=await mobileAuthor.getByRole('button',{name:'Save template',exact:true}).boundingBox();assert(saveBounds.y+saveBounds.height<=height,`${engineName} ${width} Save reachable`);
      await page.screenshot({path:`outputs/template-inputs/${engineName}-${width}x${height}-author.png`});
      await mobileAuthor.getByRole('button',{name:'Cancel',exact:true}).click();
      await page.close();record(`${engineName} ${width}x${height}: Apply/Cancel, readiness, Subject roles, mode, themes and dialog bounds`);
    }
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync('outputs/template-inputs/acceptance.json',JSON.stringify({checks,errors,workspace:root,date:new Date().toISOString()},null,2));
} finally { await browser?.close();service?.kill(); }
