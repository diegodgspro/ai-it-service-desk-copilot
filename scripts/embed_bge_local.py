"""Offline JSON-lines adapter for a reviewed local BGE Small snapshot."""
import argparse, hashlib, json, os, platform, sys
from pathlib import Path

MODEL_ID="BAAI/bge-small-en-v1.5"; MODEL_REVISION="5c38ec7c405ec4b44b94cc5a9bb96e735b38267a"; DIMENSIONS=384
MODEL_SHA256="3c9f31665447c8911517620762200d2245a2518d6e7208acc78cd9db317e21ad"
MODEL_FILES={"1_Pooling/config.json","config.json","config_sentence_transformers.json","model.safetensors","modules.json","sentence_bert_config.json","special_tokens_map.json","tokenizer.json","tokenizer_config.json","vocab.txt"}

def load_model(model_dir: Path):
    if not model_dir.is_dir() or not (model_dir/"model.safetensors").is_file(): raise ValueError("reviewed local model.safetensors is required")
    if (model_dir/"pytorch_model.bin").exists(): raise ValueError("pytorch_model.bin is forbidden")
    realized={path.relative_to(model_dir).as_posix() for path in model_dir.rglob("*") if path.is_file() and ".cache" not in path.parts}
    if realized!=MODEL_FILES: raise ValueError("local model manifest does not match the reviewed allowlist")
    digest=hashlib.sha256((model_dir/"model.safetensors").read_bytes()).hexdigest()
    if digest!=MODEL_SHA256: raise ValueError("model.safetensors digest mismatch")
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer(str(model_dir.resolve()),local_files_only=True,trust_remote_code=False,model_kwargs={"use_safetensors":True},device="cpu")

def encode(model,values):
    if not isinstance(values,list) or not 1<=len(values)<=64 or not all(isinstance(x,str) and len(x)<=4096 for x in values): raise ValueError("texts must be 1..64 strings of at most 4096 characters")
    vectors=model.encode(values,normalize_embeddings=True,convert_to_numpy=True).tolist()
    if len(vectors)!=len(values) or any(len(v)!=DIMENSIONS for v in vectors): raise ValueError("unexpected embedding shape")
    if any(not all(isinstance(x,float) and x==x and abs(x)!=float("inf") for x in v) for v in vectors): raise ValueError("invalid embedding value")
    return vectors

def metadata(model):
    import safetensors, sentence_transformers, torch, transformers
    return {"modelId":MODEL_ID,"revision":MODEL_REVISION,"dimensions":DIMENSIONS,"normalization":"SentenceTransformer.encode(normalize_embeddings=True)","pooling":model[1].get_config_dict() if len(model)>1 else {},"maxSequenceLength":model.max_seq_length,"device":str(model.device),"packages":{"sentenceTransformers":sentence_transformers.__version__,"transformers":transformers.__version__,"torch":torch.__version__,"safetensors":safetensors.__version__},"cpu":{"platform":platform.platform(),"processor":platform.processor(),"logicalCores":os.cpu_count()}}

def serve(model):
    for line in sys.stdin:
        request_id=None
        try:
            request=json.loads(line); request_id=request.get("id")
            response={"id":request_id,"metadata":metadata(model)} if request.get("operation")=="metadata" else {"id":request_id,"vectors":encode(model,request.get("texts"))}
        except Exception as error: response={"id":request_id,"error":type(error).__name__}
        print(json.dumps(response,separators=(",",":"),allow_nan=False),flush=True)

def main():
    parser=argparse.ArgumentParser(); parser.add_argument("--serve",action="store_true"); parser.add_argument("--model-dir",required=True); options=parser.parse_args()
    model=load_model(Path(options.model_dir))
    if options.serve: serve(model)
    else: json.dump(encode(model,json.load(sys.stdin)),sys.stdout,separators=(",",":"),allow_nan=False)

if __name__=="__main__": main()
