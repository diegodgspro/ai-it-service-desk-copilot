import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createInterface } from "node:readline";

export class BgeLocalProvider {
  constructor({python,modelDir,script="scripts/embed_bge_local.py",cwd=process.cwd(),env={}}={}) {
    if(!python||!modelDir)throw new TypeError("explicit semantic Python and model directory are required");
    this.id="BAAI/bge-small-en-v1.5@5c38ec7c405ec4b44b94cc5a9bb96e735b38267a";this.pending=new Map();this.sequence=0;this.closed=false;
    this.child=spawn(python,[resolve(cwd,script),"--serve","--model-dir",resolve(modelDir)],{cwd,env:{...process.env,...env},windowsHide:true,stdio:["pipe","pipe","pipe"]});
    this.child.stderr.on("data",()=>{});this.child.on("error",e=>this.fail(e));this.child.on("close",code=>this.fail(new Error(`local embedding process stopped with exit code ${code}`)));
    createInterface({input:this.child.stdout}).on("line",line=>{let response;try{response=JSON.parse(line)}catch{return this.fail(new Error("local embedding process returned invalid JSON"))}const request=this.pending.get(response.id);if(!request)return;this.pending.delete(response.id);request.signal?.removeEventListener("abort",request.abort);response.error?request.reject(new Error(`local embedding request failed: ${response.error}`)):request.resolve(response);});
  }
  fail(error){if(this.closed&&!this.pending.size)return;this.closed=true;for(const request of this.pending.values()){request.signal?.removeEventListener("abort",request.abort);request.reject(error)}this.pending.clear();}
  request(payload,signal){if(this.closed)return Promise.reject(new Error("local embedding provider is closed"));return new Promise((resolvePromise,reject)=>{const id=++this.sequence;const abort=()=>{const error=signal.reason??Object.assign(new Error("embedding aborted"),{name:"AbortError"});this.child.kill();this.fail(error)};this.pending.set(id,{resolve:resolvePromise,reject,signal,abort});signal?.addEventListener("abort",abort,{once:true});if(signal?.aborted)return abort();this.child.stdin.write(JSON.stringify({id,...payload})+"\n",error=>{if(error)this.fail(error)});});}
  async embed(texts,{signal}={}){if(!Array.isArray(texts)||!texts.length||texts.some(x=>typeof x!=="string"))throw new TypeError("embedding input must be a non-empty string array");return(await this.request({operation:"embed",texts},signal)).vectors;}
  async metadata({signal}={}){return(await this.request({operation:"metadata"},signal)).metadata;}
  async close(){if(this.closed)return;this.closed=true;this.child.stdin.end();await new Promise(resolvePromise=>this.child.once("close",resolvePromise));}
}
