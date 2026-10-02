export const ARCHIVE_FORMAT='lsw-archive-1';
export const ARCHIVE_LIMIT=100_000_000;
export const ARCHIVE_STATE_LIMIT=12_000_000;
export const ARCHIVE_EVENT_LIMIT=100_000;
export const digestText=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(b=>b.toString(16).padStart(2,'0')).join('');
export const archiveLine=(record:unknown)=>JSON.stringify(record);
export async function* archiveRecords(state:unknown,events:AsyncIterable<unknown>,count:number) {
  let hash='',parts=0,bytes=0;
  async function line(record:unknown){const text=archiveLine(record);hash=await digestText(hash+text);parts++;bytes+=new TextEncoder().encode(text+'\n').length;if(bytes>ARCHIVE_LIMIT-256)throw Error('아카이브는 100MB까지 지원합니다.');return text+'\n';}
  const text=JSON.stringify(state);
  if(new TextEncoder().encode(text).length>ARCHIVE_STATE_LIMIT||count>ARCHIVE_EVENT_LIMIT)throw Error('아카이브 상태는 12MB, 전체 사건은 100,000건까지 지원합니다.');
  yield await line({format:ARCHIVE_FORMAT,events:count});
  for(let i=0;i<text.length;){let end=Math.min(i+16000,text.length);if(/[\uD800-\uDBFF]/.test(text[end-1]))end--;yield await line({type:'state',text:text.slice(i,end)});i=end;}
  yield await line({type:'state-end'});
  let batch:unknown[]=[],length=0,seen=0;
  for await(const e of events){const size=new TextEncoder().encode(JSON.stringify(e)).length;if(size>100_000)throw Error('개별 사건이 아카이브 전송 한도를 초과합니다.');if(batch.length&&(length+size>48_000||batch.length>=20)){yield await line({type:'events',events:batch});batch=[];length=0;}batch.push(e);length+=size;seen++;}
  if(batch.length)yield await line({type:'events',events:batch});
  if(seen!==count)throw Error('아카이브 사건 수가 다릅니다.');
  yield archiveLine({type:'end',hash,parts})+'\n';
}
