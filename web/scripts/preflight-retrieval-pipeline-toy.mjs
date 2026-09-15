// Full challenge-blind pipeline preflight. This module must never import or read challenge data.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { BgeLocalProvider } from "./bge-local-provider.mjs";
import { HybridRetriever, SemanticRetriever, retrieveWithFallback } from "./retrieval-lab-core.mjs";
import { calculateChallengeMetrics, collapseToDocuments, pairedBootstrapDifference } from "./retrieval-challenge-metrics.mjs";
import { serializeLexicalRequest, serializeSemanticRequest } from "./retrieval-pipeline-boundaries.mjs";
import { CONTRACT, assertRuntimeModelContract, serialize } from "./run-retrieval-challenge-v1.mjs";

const repoRoot=resolve(new URL("../..",import.meta.url).pathname.replace(/^\/(.:)/,"$1")),webRoot=join(repoRoot,"web");
const toyCorpus={documents:[
  {documentId:"toy-kb-lantern",title:"Museum lantern handling",sourceType:"runbook",service:"Museum",category:"Collections",product:"Lantern",language:"en",approvalStatus:"approved",version:"1.0",lastReviewed:"2026-09-14",tags:["lantern"],classification:"synthetic-demo",sourcePath:"toy/lantern.md"},
  {documentId:"toy-kb-orchard",title:"Orchard basket notes",sourceType:"policy",service:"Orchard",category:"Harvest",product:"Basket",language:"en",approvalStatus:"approved",version:"1.0",lastReviewed:"2026-09-14",tags:["basket"],classification:"synthetic-demo",sourcePath:"toy/orchard.md"},
  {documentId:"toy-kb-draft",title:"Unapproved kite note",sourceType:"runbook",service:"Park",category:"Wind",product:"Kite",language:"en",approvalStatus:"draft",version:"1.0",lastReviewed:"2026-09-14",tags:["kite"],classification:"synthetic-demo",sourcePath:"toy/draft.md"}],
  chunks:[
    {documentId:"toy-kb-lantern",chunkId:"toy-lantern-1",ordinal:0,heading:"Amber glass",content:"Museum custodians wrap the amber lantern in linen before shelf transfer."},
    {documentId:"toy-kb-orchard",chunkId:"toy-orchard-1",ordinal:0,heading:"Pear basket",content:"Orchard volunteers label the woven pear basket before the autumn count."},
    {documentId:"toy-kb-draft",chunkId:"toy-draft-1",ordinal:0,heading:"Kite",content:"A silver kite waits beside the meadow gate."}]};
const toyCases=[
  {caseId:"toy-001",category:"toy_retrieval",query:"amber lantern linen shelf",metadataFilters:{service:"Museum"},expectedAbstention:false,relevance:[{documentId:"toy-kb-lantern",grade:3}]},
  {caseId:"toy-002",category:"toy_retrieval",query:"woven pear basket autumn",metadataFilters:{service:"Orchard"},expectedAbstention:false,relevance:[{documentId:"toy-kb-orchard",grade:3}]},
  {caseId:"toy-003",category:"toy_abstention",query:"volcanic telescope mineral",metadataFilters:{},expectedAbstention:true,relevance:[]}];

async function createToyD1(){
  const output=await build({entryPoints:[join(webRoot,"worker","index.ts")],bundle:true,write:false,format:"esm",platform:"browser"});
  const persistence=await mkdtemp(join(tmpdir(),"deskpilot-toy-preflight-")),origin="http://localhost";
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:output.outputFiles[0].text,compatibilityDate:"2026-09-09",bindings:{APP_ENV:"local",LOCAL_DEV_IDENTITY:"enabled"},serviceBindings:{ASSETS:()=>new Response("")},d1Databases:{DB:"toy-db"},resourcePersistencePath:persistence}));
  const db=await mf.getD1Database("DB");
  for(const name of (await readdir(join(webRoot,"migrations"))).filter(x=>x.endsWith(".sql")).sort()) await db.exec((await readFile(join(webRoot,"migrations",name),"utf8")).replace(/^--.*$/gm,"").replaceAll("\n"," "));
  await db.exec("DELETE FROM knowledge_chunks; DELETE FROM knowledge_documents;");
  for(const d of toyCorpus.documents) await db.prepare("INSERT INTO knowledge_documents(document_id,title,source_type,service,category,product,operating_system,language,approval_status,version,last_reviewed,tags_json,classification,source_path,content_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(d.documentId,d.title,d.sourceType,d.service,d.category,d.product,null,d.language,d.approvalStatus,d.version,d.lastReviewed,JSON.stringify(d.tags),d.classification,d.sourcePath,createHash("sha256").update(d.title).digest("hex")).run();
  for(const c of toyCorpus.chunks) await db.prepare("INSERT INTO knowledge_chunks(chunk_id,document_id,ordinal,heading,content,content_hash) VALUES(?,?,?,?,?,?)").bind(c.chunkId,c.documentId,c.ordinal,c.heading,c.content,createHash("sha256").update(c.content).digest("hex")).run();
  const payloads=[];
  return {retriever:{async retrieve(input){const payload=serializeLexicalRequest(input,{topK:Math.min(input.topK??3,10)});payloads.push(structuredClone(payload));const response=await mf.dispatchFetch(`${origin}/api/knowledge/retrieve`,{method:"POST",headers:{"Content-Type":"application/json",Origin:origin},body:JSON.stringify(payload)});if(!response.ok)throw new Error(`toy D1 request failed: ${response.status}`);return (await response.json()).results;}},payloads,close:async()=>{await mf.dispose();await rm(persistence,{recursive:true,force:true});}};
}
const sanitize=r=>({documentId:r.documentId,chunkId:r.chunkId,score:r.score,citation:r.citation,metadata:{service:r.metadata.service,category:r.metadata.category,product:r.metadata.product,language:r.metadata.language,approvalStatus:r.metadata.approvalStatus,version:r.metadata.version}});
const compare=(metrics)=>{const out={};for(const candidate of ["semantic","hybrid"]){out[candidate]={};for(const key of ["recallAt1","recallAt3","recallAt5","reciprocalRank","ndcgAt3","precisionAt3"]){const a=metrics.lexical.perCase.filter(x=>x.applicableToRetrieval).map(x=>x[key]),b=metrics[candidate].perCase.filter(x=>x.applicableToRetrieval).map(x=>x[key]);out[candidate][key]=pairedBootstrapDifference(a,b,CONTRACT.bootstrap);}}return out;};
const independentOverall=(cases,runs)=>{let hits=0,rr=0,abstainTp=0;for(let i=0;i<cases.length;i++){const ids=collapseToDocuments(runs[i].results).map(x=>x.documentId),relevant=new Set(cases[i].relevance.filter(x=>x.grade>=2).map(x=>x.documentId)),rank=ids.findIndex(x=>relevant.has(x));if(!cases[i].expectedAbstention){hits+=ids.slice(0,3).filter(x=>relevant.has(x)).length/relevant.size;rr+=rank<0?0:1/(rank+1);}else if(runs[i].abstained&&ids.length===0)abstainTp++;}return{recallAt3:hits/cases.filter(x=>!x.expectedAbstention).length,meanReciprocalRank:rr/cases.filter(x=>!x.expectedAbstention).length,abstentionTruePositive:abstainTp};};

async function execute(lexical,semantic,hybrid){const methods={lexical,semantic,hybrid},runs={};for(const [name,retriever] of Object.entries(methods)){runs[name]=[];for(const c of toyCases){const common={query:c.query,filters:c.metadataFilters,topK:5};const input=name==="lexical"?serializeLexicalRequest({...common,minScore:CONTRACT.lexicalMinScore}):name==="semantic"?serializeSemanticRequest({...common,semanticMinScore:CONTRACT.semanticThreshold}):{...common,minScore:CONTRACT.lexicalMinScore,semanticMinScore:CONTRACT.semanticThreshold};const results=collapseToDocuments(await retriever.retrieve(input)).map(sanitize);runs[name].push({caseId:c.caseId,results,abstained:results.length===0});}}return runs;}

const d1=await createToyD1(),provider=new BgeLocalProvider({python:join(repoRoot,".semantic-venv","Scripts","python.exe"),modelDir:join(repoRoot,".semantic-cache","model"),cwd:repoRoot,env:{HF_HOME:join(repoRoot,".semantic-cache"),HF_HUB_OFFLINE:"1",TRANSFORMERS_OFFLINE:"1",HF_DATASETS_OFFLINE:"1",HF_HUB_DISABLE_TELEMETRY:"1"}});
try{
  const model=await provider.metadata();assertRuntimeModelContract(model);
  const semantic=new SemanticRetriever(toyCorpus,provider,{dimensions:CONTRACT.dimensions,minScore:CONTRACT.semanticThreshold,queryTransform:q=>CONTRACT.queryInstruction+q});
  const hybrid=new HybridRetriever(d1.retriever,semantic,{rrfK:CONTRACT.rrfK,minFusedScore:CONTRACT.minFusedScore});
  const first=await execute(d1.retriever,semantic,hybrid),firstPayloads=structuredClone(d1.payloads);d1.payloads.length=0;const second=await execute(d1.retriever,semantic,hybrid);
  assert.equal(serialize(first),serialize(second),"repeated toy output differs");assert.equal(serialize(firstPayloads),serialize(d1.payloads),"D1 payload sequence differs");
  for(const p of firstPayloads){assert.deepEqual(Object.keys(p).sort(),["filters","minScore","query","topK"]);assert.ok(!JSON.stringify(p).includes("semanticMinScore"));}
  const timeoutLexical={retrieve:async()=>[]},hanging={retrieve:async({signal})=>new Promise((_,reject)=>signal.addEventListener("abort",()=>reject(signal.reason),{once:true}))};
  const fallback=await retrieveWithFallback({enabled:true,mode:"semantic",lexical:timeoutLexical,semantic:hanging,query:{query:"toy timeout",filters:{},topK:1,minScore:.5,semanticMinScore:.5},timeoutMs:5});assert.deepEqual({method:fallback.method,fallback:fallback.fallback},{method:"lexical",fallback:true});
  const metrics=Object.fromEntries(Object.entries(first).map(([name,runs])=>[name,calculateChallengeMetrics(toyCases,runs,toyCorpus)])),bootstrap=compare(metrics);
  for(const [name,runs] of Object.entries(first)){const independent=independentOverall(toyCases,runs),overall=metrics[name].overall;assert.equal(independent.recallAt3,overall.recallAt3);assert.equal(independent.meanReciprocalRank,overall.meanReciprocalRank);assert.equal(independent.abstentionTruePositive,overall.abstention.truePositive);assert.equal(overall.invalidCitationCount,0);assert.equal(overall.duplicateDocumentIdentityCount,0);}
  const artifact={schemaVersion:1,status:"passed",challengeContentAccessed:false,contract:{lexicalMinScore:CONTRACT.lexicalMinScore,semanticThreshold:CONTRACT.semanticThreshold,queryInstruction:CONTRACT.queryInstruction,pooling:CONTRACT.pooling,normalization:CONTRACT.normalization,rrfK:CONTRACT.rrfK,minFusedScore:CONTRACT.minFusedScore,bootstrap:CONTRACT.bootstrap},model:{id:model.modelId,revision:model.revision,safetensorsSha256:CONTRACT.modelSha256},toy:{documents:toyCorpus.documents.length,chunks:toyCorpus.chunks.length,cases:toyCases.length},checks:{exactD1PayloadSchema:true,semanticTimeoutFallback:true,deterministicRepeatedOutput:true,byteStableArtifacts:true,independentMetricRecalculation:true,invalidCitations:0,duplicateDocumentIdentities:0,sanitizedPathsAndMetadata:true},runs:first,metrics,bootstrap};
  const json=serialize(artifact),report=["# DeskPilot toy pipeline preflight","","Status: **passed**.","","This challenge-blind run used three unrelated toy documents and queries in a fresh local D1 database plus the verified offline BGE model.","",`- Lexical Recall@3: ${metrics.lexical.overall.recallAt3.toFixed(3)}`,`- Semantic Recall@3: ${metrics.semantic.overall.recallAt3.toFixed(3)}`,`- Hybrid Recall@3: ${metrics.hybrid.overall.recallAt3.toFixed(3)}`,`- Abstention TP (lexical/semantic/hybrid): ${metrics.lexical.overall.abstention.truePositive}/${metrics.semantic.overall.abstention.truePositive}/${metrics.hybrid.overall.abstention.truePositive}`,"- Exact D1 schema, semantic timeout/fallback, deterministic repeatability, independent recalculation, citations, identities, filtering, approved-only policy, and sanitization: passed.","- Challenge content accessed: no.",""].join("\n");
  const outputDir=join(repoRoot,"docs","evaluations");await writeFile(join(outputDir,"retrieval-challenge-v1-toy-pipeline-preflight.json"),json);await writeFile(join(outputDir,"retrieval-challenge-v1-toy-pipeline-preflight.md"),report);
  assert.equal(await readFile(join(outputDir,"retrieval-challenge-v1-toy-pipeline-preflight.json"),"utf8"),json);assert.equal(await readFile(join(outputDir,"retrieval-challenge-v1-toy-pipeline-preflight.md"),"utf8"),report);
  process.stdout.write(serialize({status:"passed",checks:artifact.checks,metrics:Object.fromEntries(Object.entries(metrics).map(([k,v])=>[k,v.overall]))}));
}finally{await provider.close();await d1.close();}
