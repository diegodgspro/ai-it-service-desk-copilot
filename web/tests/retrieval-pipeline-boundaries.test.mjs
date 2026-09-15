import assert from "node:assert/strict";
import test from "node:test";
import { HybridRetriever } from "../scripts/retrieval-lab-core.mjs";
import { createHybridFusionInput, serializeLexicalRequest, serializeSemanticRequest } from "../scripts/retrieval-pipeline-boundaries.mjs";

const mixed = { query:"unrelated toy words", filters:{service:"Toy",operatingSystem:"Leak",approvalStatus:"approved"}, topK:7,
  minScore:.17, semanticMinScore:.83, timeoutMs:321, signal:new AbortController().signal, embeddings:[[1]], semanticScores:[.9], rrfK:99,
  model:{id:"must-not-leak"}, unknown:"reject" };

test("lexical serializer emits the exact strict D1 allowlist and independent lexical threshold",()=>{
  const value=serializeLexicalRequest(mixed);
  assert.deepEqual(value,{query:mixed.query,filters:{service:"Toy",approvalStatus:"approved"},topK:7,minScore:.17});
  assert.deepEqual(Object.keys(value).sort(),["filters","minScore","query","topK"]);
  for(const key of ["semanticMinScore","timeoutMs","signal","embeddings","semanticScores","rrfK","model","unknown"]) assert.ok(!(key in value));
});

test("semantic serializer isolates provider controls and never aliases lexical minScore",()=>{
  const value=serializeSemanticRequest(mixed);
  assert.equal(value.semanticMinScore,.83); assert.equal(value.timeoutMs,321); assert.equal(value.signal,mixed.signal);
  assert.ok(!("minScore" in value)); assert.ok(!("operatingSystem" in value.filters));
});

test("fusion input contains only query, filters and topK",()=>{
  assert.deepEqual(createHybridFusionInput(mixed),{query:mixed.query,filters:{service:"Toy",approvalStatus:"approved"},topK:7});
});

test("hybrid keeps requests and results isolated and does not mutate them",async()=>{
  const calls=[]; const lexicalResults=Object.freeze([]),semanticResults=Object.freeze([]);
  const lexical={retrieve:async x=>(calls.push(["lexical",x]),lexicalResults)};
  const semantic={retrieve:async x=>(calls.push(["semantic",x]),semanticResults)};
  const original=structuredClone({...mixed,signal:undefined});
  const hybrid=new HybridRetriever(lexical,semantic,{rrfK:60,minFusedScore:1/61});
  assert.deepEqual(await hybrid.retrieve({...mixed,signal:undefined}),[]);
  assert.deepEqual(calls[0][1],{query:mixed.query,filters:{service:"Toy",approvalStatus:"approved"},topK:20,minScore:.17});
  assert.deepEqual(calls[1][1],{query:mixed.query,filters:{service:"Toy",approvalStatus:"approved"},topK:20,semanticMinScore:.83,timeoutMs:321});
  assert.deepEqual({...mixed,signal:undefined},original);
});
