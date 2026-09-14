# BGE Small local-model provenance gate

This record covers the optional, local-only evaluation of
`BAAI/bge-small-en-v1.5`. It does not enable semantic retrieval in production
and does not authorize a remote inference API, deployment, Cloudflare Workers
AI, Vectorize, or committing model artifacts.

## Reviewed source

- Repository: `BAAI/bge-small-en-v1.5` on the public Hugging Face Hub
- Immutable revision: `5c38ec7c405ec4b44b94cc5a9bb96e735b38267a`
- License declared by the official repository: MIT
- Architecture: BERT, 384 hidden dimensions and 512 maximum positions
- Sentence Transformers modules: Transformer, CLS pooling, then normalization
- Weight format: `model.safetensors` only; `pytorch_model.bin` is prohibited

Primary records:

- <https://huggingface.co/BAAI/bge-small-en-v1.5/tree/5c38ec7c405ec4b44b94cc5a9bb96e735b38267a>
- <https://huggingface.co/BAAI/bge-small-en-v1.5/blob/5c38ec7c405ec4b44b94cc5a9bb96e735b38267a/1_Pooling/config.json>
- <https://huggingface.co/BAAI/bge-small-en-v1.5/blob/5c38ec7c405ec4b44b94cc5a9bb96e735b38267a/model.safetensors>

## Allowed snapshot manifest

Acquisition must use the full revision above and an explicit allowlist. Only
the following inference files may be downloaded:

```text
1_Pooling/config.json
config.json
config_sentence_transformers.json
model.safetensors
modules.json
sentence_bert_config.json
special_tokens_map.json
tokenizer.json
tokenizer_config.json
vocab.txt
```

The allowlist excludes `pytorch_model.bin`, `onnx/**`, and every OpenVINO,
TensorFlow, Flax, or other alternate model format. Before inference, record
each downloaded file's byte size and SHA-256 digest, verify that the realized
file set exactly equals this manifest, and fail closed on any mismatch.

The repository reports `model.safetensors` as 133 MB (decimal), with SHA-256
`3c9f31665447c8911517620762200d2245a2518d6e7208acc78cd9db317e21ad`.
The estimated complete allowlisted snapshot was approximately 134 MB decimal.
The realized ten-file snapshot is 134,411,157 bytes. The downloaded
`model.safetensors` digest is
`3c9f31665447c8911517620762200d2245a2518d6e7208acc78cd9db317e21ad`,
matching the repository record. No prohibited alternate model file was present.

## Local isolation and offline execution

Use the dedicated `.semantic-venv/` environment and `.semantic-cache/` Hugging
Face cache, both ignored by Git. Do not store an absolute user path in tracked files.
Network access is allowed only for the explicit, revision-pinned acquisition.
Inference must load the realized local snapshot with `local_files_only=True`
and Hugging Face offline mode enabled. No token is required for this public
repository; stop if authentication is requested.

The ordinary Python and web dependency paths, tests, CI, builds, and production
startup must remain independent of `requirements-semantic.txt`, the isolated
environment, the model snapshot, and generated vectors.

## Runtime and query behavior

The repository's Sentence Transformers configuration performs CLS pooling and
then L2 normalization. Inference must retain those choices and produce finite,
normalized 384-dimensional vectors. Inputs are truncated to the model's
512-token maximum. Evaluate both the original query and the official prefix
`Represent this sentence for searching relevant passages: `. Never prepend the
instruction to knowledge passages, and select a query configuration only from
the separated evaluation results.

## Dependency review gate

`requirements-semantic.txt` pins the direct optional dependency. Install it
only in the ignored isolated environment, capture the complete resolved package
versions and platform details, then run both `pip check` and `pip-audit` against
that environment. A clean known-vulnerability scan does not establish package
provenance or detect malicious code; unexpected dependencies or audit findings
require review before model loading. Do not add semantic packages to production
requirements.

The reviewed Windows CPU environment resolved Sentence Transformers 6.0.1,
Transformers 5.10.4, PyTorch 2.14.0+cpu, Safetensors 0.8.0, and Hugging Face Hub
1.31.0. Sentence Transformers 5.1.0 was rejected before model use because its
Transformers 4.x resolution had known vulnerabilities. The final environment
passed `pip check` and `pip-audit --vulnerability-service osv` with no known
vulnerabilities.
