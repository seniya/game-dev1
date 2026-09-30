import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutMapLabels, labelsOverlap, type MapLabel } from '../src/ui/map-labels';
const measure = (text: string) => Array.from(text).length * 12;
const label = (id: string, priority = 10, x = 120, y = 100): MapLabel => ({ id, text: `${id}의 긴 시설 이름`, x, y, priority });

test('dense object, resident and badge labels never overlap and focused targets take priority', () => {
  const candidates = Array.from({length: 30}, (_, i) => label(`farm${i}`, 10, 90 + i % 6 * 20, 70 + Math.floor(i / 6) * 15));
  candidates.push(label('selected',100), label('hovered',90), label('partner',70), label('badge',5));
  const result = layoutMapLabels(candidates, 320, 240, measure);
  assert.equal(result[0].id, 'selected'); assert.ok(result.some(l=>l.id==='hovered')); assert.ok(result.length < candidates.length);
  for (let i = 0; i < result.length; i++) for (const other of result.slice(i+1)) assert.equal(labelsOverlap(result[i].rect, other.rect), false);
  assert.deepEqual(result, layoutMapLabels([...candidates].reverse(), 320, 240, measure));
});

test('selected labels at viewport edges stay readable and avoid controls, duplicates and overflow', () => {
  const control = { x: 8, y: 8, width: 150, height: 30 }, focus = {...label('one',100,0,-100),text:'아주 긴 시설 이름을 반복합니다 '.repeat(20)};
  const result = layoutMapLabels([label('one'), focus, label('two',90,280,200)],280,200,measure,[control]);
  assert.equal(result.filter(l=>l.id==='one').length,1); assert.ok(result[0].text.endsWith('…'));
  for (const l of result) {
    assert.ok(l.rect.x>=8 && l.rect.y>=8); assert.ok(l.rect.x+l.rect.width<=272 && l.rect.y+l.rect.height<=192);
    assert.equal(labelsOverlap(l.rect,control),false);
  }
});

test('overview suppresses crowded background labels; focused names survive a narrow mobile viewport', () => {
  const candidates = [label('focus',100), ...Array.from({length: 12},(_,i)=>label(`workshop${i}`,10,50+i*30,110))];
  for (const width of [280,390,900]) {
    const result = layoutMapLabels(candidates,width,240,measure);
    assert.ok(result.some(l=>l.id==='focus'));
    for (let i=0;i<result.length;i++) for(const other of result.slice(i+1)) assert.equal(labelsOverlap(result[i].rect,other.rect),false);
  }
});
