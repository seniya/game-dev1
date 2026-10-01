import { test, expect } from '@playwright/test';

test('story walk keeps its reading snapshot and links to actual people, evidence and lives', async ({page}) => {
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?local=1');await page.getByRole('button',{name:'일시정지',exact:true}).click();
  const walk=page.locator('#story-walk');await expect(walk.locator('.walk-card')).toHaveCount(3);
  const before=await walk.innerHTML();await page.getByRole('button',{name:'한 틱 진행'}).click();
  expect(await walk.innerHTML()).toBe(before);
  await walk.getByRole('button',{name:'근거 기록'}).first().click();await expect(page.locator('#detail-dialog')).toBeVisible();
  await page.locator('#detail-dialog').evaluate((d:HTMLDialogElement)=>d.close());
  const id=await walk.locator('.walk-card').first().getAttribute('data-walk-person');
  await walk.getByRole('button',{name:'하루 따라보기'}).first().click();
  await expect(page.locator('#world-map')).toHaveAttribute('data-selected',id!);
  await expect(page.locator('#walk-guide .done')).toHaveCount(1);
  await page.getByRole('button',{name:'관심 주민 지정',exact:true}).click();
  await expect(page.locator('#walk-guide .done')).toHaveCount(2);
  await walk.getByRole('button',{name:'관심 주민',exact:true}).click();await expect(walk.locator('.walk-card')).toHaveCount(1);
  await walk.getByRole('button',{name:'삶의 이야기',exact:true}).click();await expect(page.locator('#biography .life-chapters')).toBeVisible();
  await page.locator('#detail-dialog').evaluate((d:HTMLDialogElement)=>d.close());
  await expect(page.locator('#walk-guide .done')).toHaveCount(3);
  await page.getByRole('button',{name:'첫 관찰 안내 접기'}).click();await expect(page.locator('#walk-guide')).toBeHidden();
  await page.reload();await expect(page.locator('#walk-guide')).toBeHidden();
  await page.getByRole('button',{name:'처음 오셨나요?'}).click();await expect(page.locator('#walk-guide .done')).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('immersive mode restores controls with Escape without changing world time or speed', async ({page}) => {
  await page.goto('/?local=1');await page.getByRole('button',{name:'일시정지',exact:true}).click();
  const time=await page.locator('#game-clock').innerText();
  await page.getByRole('button',{name:'몰입 보기'}).click();await expect(page.locator('body')).toHaveClass('immersive');
  await expect(page.locator('#play-button')).toBeVisible();await expect(page.locator('.sidebar')).toBeHidden();
  await page.keyboard.press('Escape');await expect(page.locator('body')).not.toHaveClass('immersive');
  await expect(page.locator('#immersive-button')).toBeFocused();
  expect(await page.locator('#game-clock').innerText()).toBe(time);await expect(page.locator('[data-speed="1"]')).toHaveAttribute('aria-pressed','true');
});

test('mobile, reduced motion, empty topics and blocked storage stay usable', async ({page}) => {
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(()=>{Storage.prototype.setItem=()=>{throw new Error('disabled');};});
  await page.goto('/?local=1');await page.getByRole('button',{name:'일시정지',exact:true}).click();
  const walk=page.locator('#story-walk');await walk.getByRole('button',{name:'관심 주민',exact:true}).click();
  await expect(walk).toContainText('아직 기억해 둔 주민이 없어요');
  await walk.getByRole('button',{name:'모든 이야기 둘러보기'}).click();
  await walk.getByRole('button',{name:'다른 주민 만나기'}).click();
  await walk.getByRole('button',{name:'새 이야기 찾기'}).click();
  await expect(walk.locator('.walk-card')).toHaveCount(3);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'처음 오셨나요?'}).click();await expect(page.locator('#walk-guide')).toBeVisible();
  await page.getByRole('button',{name:'몰입 보기'}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'일반 보기'}).click();
});

test('a new world clears old recommendations and guide progress; topic buttons keep keyboard focus', async ({page}) => {
  await page.goto('/?local=1');await page.getByRole('button',{name:'일시정지',exact:true}).click();
  await page.locator('#story-walk [data-npc]').first().click();await expect(page.locator('#walk-guide .done')).toHaveCount(1);
  await page.locator('[data-walk-lens="social"]').click();await expect(page.locator('[data-walk-lens="social"]')).toBeFocused();
  await page.getByRole('button',{name:'관찰 실험실',exact:true}).click();await page.locator('#seed-input').fill('123');await page.getByRole('button',{name:'새로 시작',exact:true}).click();
  await page.getByRole('button',{name:'세계 관찰',exact:true}).click();
  await expect(page.locator('#walk-guide .done')).toHaveCount(0);await expect(page.locator('[data-walk-lens="all"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#story-walk .walk-card')).toHaveCount(3);
});
