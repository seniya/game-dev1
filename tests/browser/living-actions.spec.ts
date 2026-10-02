import {test,expect,type Page} from '@playwright/test';
import {writeFileSync,mkdirSync} from 'node:fs';
async function send(page:Page,action:object){return page.evaluate(async action=>{const w=await(await fetch('/api/world')).json();const r=await fetch('/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:crypto.randomUUID(),revision:w.revision,action})});if(!r.ok)throw Error(await r.text());return r.json();},action);}
async function ready(page:Page){await page.goto('/');await expect(page.locator('#load-button')).toBeEnabled();await send(page,{type:'reset',seed:42,population:12});await page.locator('#cloud-retry').click();}
test('mobile return digest groups actual changes and exposes farm evidence and funded construction',async({page})=>{
 await ready(page);await page.setViewportSize({width:390,height:844});await page.locator('#connection-details summary').click();await send(page,{type:'ai-mode',mode:'off'});await send(page,{type:'step',ticks:144});await page.locator('#cloud-retry').click();await expect(page.locator('#game-clock')).toContainText('2일째');
 await page.locator('[data-digest=since]').click();await expect(page.locator('.return-changes')).toContainText('가족의 변화');await expect(page.locator('.return-changes')).toContainText('주거와 공사');await expect(page.locator('.return-changes .story-event').first()).toBeVisible();
 await page.locator('#observation-details').evaluate((d:HTMLDetailsElement)=>d.open=true);await expect(page.locator('#observation-details')).toContainText('현재 조건의 추정');await page.getByRole('button',{name:'성장·수확·피해 기록'}).first().click();await expect(page.getByRole('dialog')).toContainText('미수확 작물');await page.getByRole('button',{name:'닫기',exact:true}).click();
 await page.locator('#build-position').click();await expect(page.locator('#placed-build')).toContainText('주민 현장 노동');await expect(page.getByRole('dialog')).toContainText('시장 기금 1코인');await page.getByRole('button',{name:'닫기',exact:true}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);mkdirSync('reports/screenshots',{recursive:true});await page.locator('.return-changes').screenshot({path:'reports/screenshots/v025-return.png'});
});
test('conversation outcome controls refresh without spending model budget',async({page})=>{
 await ready(page);await send(page,{type:'step',ticks:144});await page.locator('#cloud-retry').click();const w=await(await page.request.get('/api/world')).json();const n=w.state.npcs.find((n:{alive:boolean;memories:unknown[]})=>n.alive&&n.memories.length);
 await page.evaluate(id=>{const b=document.createElement('button');b.dataset.npc=id;document.body.append(b);b.click();b.remove();},n.id);
 await page.locator('[data-expression=dialogue]').click();let calls=0;page.on('request',r=>{if(new URL(r.url()).pathname==='/api/expressions')calls++;});
 await expect(page.locator('#conversation-outcomes')).toContainText('대화 이후의 약속');await page.locator('#refresh-promises').click();await expect(page.locator('#refresh-promises')).toBeEnabled();expect(calls).toBe(0);
 await page.locator('#expression-question').fill('지난 약속은 어떻게 됐어?');await page.locator('#expression-form button[type=submit]').click();await expect(page.locator('#expression-status')).toContainText('저장했습니다');expect(calls).toBe(1);await page.getByRole('dialog').screenshot({path:'reports/screenshots/v025-promises.png'});
});
test('mobile map culling preserves identical pixels and measures fewer interpolation samples at 3000 residents',async({page})=>{
 test.setTimeout(120000);await page.setViewportSize({width:390,height:844});await page.goto('/?local=1');
 const result=await page.evaluate(async()=>{
  const enginePath='/src/sim/engine.ts',mapPath='/src/ui/map.ts',motionPath='/src/ui/motion.ts';
  const {Simulation}=await import(enginePath),{WorldMap}=await import(mapPath),{MotionPlayback}=await import(motionPath);
  const sim=new Simulation(42,3000);sim.setLLM(false);const w=sim.snapshot(),canvas=document.createElement('canvas');canvas.style.width='390px';document.body.append(canvas);
  const map=new WorldMap(canvas,()=>{});map.update(w,'npc0',{playing:false});const narrowed=map.residents;const now=performance.now(),original=MotionPlayback.prototype.position;let calls=0;MotionPlayback.prototype.position=function(...args:unknown[]){calls++;return original.apply(this,args);};
  try {const run=(residents:unknown[])=>{map.residents=residents;calls=0;const t=performance.now();for(let i=0;i<30;i++)map.draw(now);const ms=performance.now()-t;return{ms,calls,pixels:canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data};};
   const full=run(w.npcs.filter((n:{alive:boolean})=>n.alive)),culled=run(narrowed);const same=full.pixels.every((b:number,i:number)=>b===culled.pixels[i]);return{population:3000,frames:30,fullMs:full.ms,culledMs:culled.ms,fullSamples:full.calls,culledSamples:culled.calls,candidates:narrowed.length,samePixels:same,scope:'Local Chromium mobile viewport; stationary full-detail world, no physics omitted'};
  }finally{MotionPlayback.prototype.position=original;canvas.remove();}
 });
 expect(result.samePixels).toBe(true);expect(result.culledSamples).toBeLessThan(result.fullSamples);writeFileSync('reports/living-actions-map-profile.json',JSON.stringify(result,null,2)+'\n');
});
