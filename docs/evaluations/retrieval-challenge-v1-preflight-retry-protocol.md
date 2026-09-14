# DeskPilot challenge v1.0.1 preflight-retry protocol

The immutable original pre-execution commit is
`3ee8ff1870b4f7410df49c2d99526350dadc5273`. Its aborted preflight evidence is
preserved as `retrieval-challenge-v1-attempt-0-preflight-failure.json`, with
SHA-256 `a0456d06a503364c35e8d84e55f7729960cfdf5f06d1c77bd07b706bddb96124`.
The failure occurred at runtime model-metadata validation, before warm-up and
before retrieval. Zero challenge queries were processed, no metrics were
generated, and this was not the primary evaluation.

The only permitted correction is parsing and fail-closed validation of the
verified official model's legacy on-disk pooling metadata and its exact
Sentence Transformers 6.0.1 runtime representation. Tests may add synthetic
metadata fixtures. The correction must not remove validation or accept unknown
schemas, ambiguous modes, multiple modes, or mean pooling as CLS.

Challenge validity is preserved only if all of the following remain frozen:

- challenge dataset and labels, version 1.0.1, and SHA-256
  `80fe584390415a90a068c6b7b7a2023790985b457798b0991a5d50843f470ec5`;
- semantic threshold `0.50` and the official query instruction;
- CLS pooling, L2 normalization, model revision
  `5c38ec7c405ec4b44b94cc5a9bb96e735b38267a`, and safetensors SHA-256
  `3c9f31665447c8911517620762200d2245a2518d6e7208acc78cd9db317e21ad`;
- canonical D1 FTS5 behavior, semantic ranking, RRF/fusion parameters, all
  evaluation metrics, and the bootstrap seed, resample count, and confidence.

No challenge query may be used for diagnosis or preflight. The retry checkpoint
must pass metadata regression tests, a fixed unrelated toy-sentence offline
preflight, ordinary local gates, and GitHub Actions before execution. The first
challenge query processed starts primary run 1. Any subsequent failure makes
that run invalid; its evidence must be preserved and execution must stop. After
results are observed there is no tuning or rerun.
