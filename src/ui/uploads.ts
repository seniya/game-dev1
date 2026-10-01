import type { inspectSave } from '../sim/save-inspection';
export async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? '서버 요청을 완료하지 못했습니다.');
  return data;
}
export async function uploadSave(file: File, progress: (text: string) => void) {
  if (file.size > 24_000_000) throw new Error('분할 파일 가져오기는 24MB까지 지원합니다.');
  const text = await file.text();
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const parts: string[] = [];
  for (let i = 0; i < text.length; ) {
    let end = Math.min(i + 24_000, text.length);
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    parts.push(text.slice(i, end));
    i = end;
  }
  const upload = await postJSON<{ id: string; next: number; status: string }>('uploads', {
    type: 'start',
    hash,
    bytes: new TextEncoder().encode(text).length,
  });
  for (let part = upload.next; part < parts.length; part++) {
    progress(
      `파일 업로드 ${Math.round((part / parts.length) * 100)}% · 연결이 끊기면 같은 파일을 다시 선택해 이어갈 수 있습니다.`,
    );
    await postJSON('uploads', { type: 'part', id: upload.id, part, text: parts[part] });
  }
  progress('서버에서 세계와 사건의 참조를 검증하고 있습니다…');
  return postJSON<{ id: string; summary: ReturnType<typeof inspectSave>; epoch: string; revision: number }>('uploads', {
    type: 'validate',
    id: upload.id,
  });
}
