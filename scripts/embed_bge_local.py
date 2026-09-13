"""Optional offline adapter for BAAI/bge-small-en-v1.5; JSON strings in, vectors out."""
import json
import sys

MODEL_ID = "BAAI/bge-small-en-v1.5"
MODEL_REVISION = "5c38ec7c405ec4b44b94cc5a9bb96e735b38267a"
DIMENSIONS = 384

def main() -> None:
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer(MODEL_ID, revision=MODEL_REVISION, local_files_only=True)
    values = json.load(sys.stdin)
    if not isinstance(values, list) or not all(isinstance(x, str) for x in values):
        raise ValueError("input must be a JSON array of strings")
    vectors = model.encode(values, normalize_embeddings=True).tolist()
    if any(len(vector) != DIMENSIONS for vector in vectors):
        raise ValueError("unexpected embedding dimensions")
    json.dump(vectors, sys.stdout, separators=(",", ":"), allow_nan=False)

if __name__ == "__main__":
    main()
