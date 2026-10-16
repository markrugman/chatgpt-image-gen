// Deterministic app-server fixture. Never contacts a provider or reads credentials.
import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
const root=process.env.IMAGEGEN_TEMPLATE_FIXTURE;
if(!root)throw Error('A disposable fixture directory is required');
let sequence=0;
const send=value=>process.stdout.write(JSON.stringify(value)+'\n');
readline.createInterface({input:process.stdin}).on('line',line=>{
  const m=JSON.parse(line);if(m.id===undefined)return;
  fs.appendFileSync(path.join(root,'rpc.jsonl'),JSON.stringify(m)+'\n');
  let result={};
  if(m.method==='account/read')result={account:{type:'chatgpt'}};
  if(m.method==='modelProvider/capabilities/read')result={imageGeneration:true};
  if(m.method==='thread/start'||m.method==='thread/fork')result={thread:{id:'fixture-thread-'+(++sequence)}};
  if(m.method==='thread/resume')result={thread:{id:m.params.threadId}};
  if(m.method==='turn/start'){
    const turnId='fixture-turn-'+(++sequence),threadId=m.params.threadId;
    send({id:m.id,result:{turn:{id:turnId}}});
    const mode=fs.readFileSync(path.join(root,'provider-mode'),'utf8');
    const finish=()=>{
      if(mode==='fail'){
        send({method:'error',params:{threadId,error:{message:'Deliberate fixture failure'}}});
        send({method:'turn/completed',params:{threadId,turn:{id:turnId,status:'failed'}}});
      }else{
        send({method:'item/completed',params:{threadId,item:{type:'imageGeneration',status:'completed',savedPath:path.join(root,'source.png')}}});
        send({method:'turn/completed',params:{threadId,turn:{id:turnId,status:'completed'}}});
      }
    };
    if(mode==='hold'){
      const timer=setInterval(()=>{if(fs.existsSync(path.join(root,'release'))){clearInterval(timer);finish();}},50); timer.unref();
    }else setTimeout(finish,100);
    return;
  }
  send({id:m.id,result});
});
