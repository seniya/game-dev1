import { ARCHIVE_LIMIT } from '../shared/archive';
import type { inspectSave } from '../sim/save-inspection';
import { postJSON } from './uploads';
/** File.stream keeps the browser's working set bounded too. */
export async function* fileLines(file:File) {
  const reader=file.stream().pipeThrough(new TextDecoderStream('utf-8',{fatal:true})).getReader();let pending='';
  try{while(true){const {value,done}=await reader.read();if(done)break;pending+=value;let end;while((end=pending.indexOf('\n'))!==-1){const line=pending.slice(0,end);pending=pending.slice(end+1);if(line.length>140000)throw Error('아카이브 레코드가 너무 큽니다.');yield line;}if(pending.length>140000)throw Error('아카이브 레코드가 너무 큽니다.');}if(pending)throw Error('아카이브 끝이 불완전합니다.');}finally{await reader.cancel();reader.releaseLock();}
}
export async function uploadArchive(file:File,progress:(text:string)=>void,signal?:AbortSignal) {
  if(file.size>ARCHIVE_LIMIT)throw Error('아카이브는 100MB까지 지원합니다.');
  const tail=(await file.slice(-512).text()).trim().split('\n').at(-1)!;
  let footer;try{footer=JSON.parse(tail);}catch{throw Error('아카이브 완료 기록을 찾을 수 없습니다. 내보내기를 다시 완료해 주세요.');}
  if(footer.type!=='end'||typeof footer.hash!=='string'||!/^[a-f0-9]{64}$/.test(footer.hash)||!Number.isSafeInteger(footer.parts)||footer.parts<1)throw Error('아카이브 완료 기록을 확인해 주세요.');
  const upload=await postJSON<{id:string;next:number;status:string}>('archive-uploads',{type:'start',hash:footer.hash,bytes:file.size});
  let part=0;
  for await(const line of fileLines(file)) {
    signal?.throwIfAborted();
    if(part===footer.parts){if(line!==tail)throw Error('아카이브 완료 기록이 다릅니다.');part++;continue;}
    if(part>footer.parts)throw Error('아카이브 끝에 알 수 없는 기록이 있습니다.');
    if(part>=upload.next)await postJSON('archive-uploads',{type:'record',id:upload.id,part,line});
    part++;progress(`아카이브 전송·검증 ${Math.floor(part/footer.parts*100)}% · ${part}/${footer.parts}조각. 중단 후 같은 파일로 이어갈 수 있습니다.`);
  }
  if(part!==footer.parts+1)throw Error('아카이브 조각이 누락되었습니다.');
  signal?.throwIfAborted();progress('모든 조각을 받았습니다. 현재 상태와 원본 사건의 일치를 확인하고 있습니다…');
  return postJSON<{id:string;summary:ReturnType<typeof inspectSave>;epoch:string;revision:number}>('archive-uploads',{type:'finish',id:upload.id,parts:footer.parts});
}
