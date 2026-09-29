// Versioned, lossless changes to persisted JSON. Replay never runs the engine or a model.
type JSONValue = null | boolean | number | string | JSONValue[] | { [key: string]: JSONValue };
type Delta = ['set', JSONValue] | ['object', Record<string, Delta>, string[]] | ['array', Record<string, Delta>, number];
export interface StateChange { version: 1; delta: Delta | null }

function diff(before: JSONValue, after: JSONValue): Delta | null {
  if (before === after) return null;
  if (before === null || after === null || typeof before !== 'object' || typeof after !== 'object' || Array.isArray(before) !== Array.isArray(after)) return ['set', after];
  const fields: Record<string, Delta> = Object.create(null);
  for (const key of Object.keys(after)) {
    const next = (after as Record<string, JSONValue>)[key];
    const change = Object.hasOwn(before, key) ? diff((before as Record<string, JSONValue>)[key], next) : ['set', next] as Delta;
    if (change) fields[key] = change;
  }
  const removed = Array.isArray(after) ? [] : Object.keys(before).filter(key => !Object.hasOwn(after, key));
  if (!Object.keys(fields).length && !removed.length && (!Array.isArray(after) || (before as JSONValue[]).length === after.length)) return null;
  const delta: Delta = Array.isArray(after) ? ['array', fields, after.length] : ['object', fields, removed];
  // Replacing a heavily changed subtree is cheaper than many individual field edits.
  const replacement: Delta = ['set', after];
  return JSON.stringify(delta).length < JSON.stringify(replacement).length ? delta : replacement;
}

export function stateChange(before: unknown, after: unknown): StateChange {
  // Match JSON storage semantics (optional undefined fields disappear).
  return { version: 1, delta: diff(JSON.parse(JSON.stringify(before)), JSON.parse(JSON.stringify(after))) };
}

function apply(value: JSONValue, delta: Delta): JSONValue {
  if (delta[0] === 'set') return delta[1];
  if (!value || typeof value !== 'object' || Array.isArray(value) !== (delta[0] === 'array')) throw new Error('세계 변경 기록의 구조가 올바르지 않습니다.');
  for (const [key, change] of Object.entries(delta[1])) {
    const next = apply(Object.hasOwn(value, key) ? (value as Record<string, JSONValue>)[key] : null, change);
    Object.defineProperty(value, key, { value: next, enumerable: true, writable: true, configurable: true });
  }
  if (delta[0] === 'array') (value as JSONValue[]).length = delta[2];
  else for (const key of delta[2]) delete (value as Record<string, JSONValue>)[key];
  return value;
}

export function restoreChange<T>(value: T, change: StateChange): T {
  if (change.version !== 1) throw new Error('지원하지 않는 세계 변경 기록 버전입니다.');
  return (change.delta ? apply(value as JSONValue, change.delta) : value) as T;
}
