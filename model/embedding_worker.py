#!/usr/bin/env python
"""Private local worker protocol: one JSON request and response per line."""
import argparse
import json
import os
import sys


def send(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    args = parser.parse_args()
    if not os.path.isdir(args.model):
        send({"type": "fatal", "error": {"code": "EMBED_MODEL_NOT_FOUND", "message": "Configured local model directory does not exist", "recoverable": True}})
        return 2
    try:
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer(args.model, local_files_only=True)
    except Exception as exc:
        # Avoid forwarding exception reprs which may include paths or source text.
        send({"type": "fatal", "error": {"code": "EMBED_MODEL_LOAD", "message": "Could not load local model; install model/requirements.txt in an isolated environment and verify model files", "recoverable": True}})
        return 3
    send({"type": "ready", "model": os.path.basename(os.path.normpath(args.model))})
    for line in sys.stdin:
        try:
            request = json.loads(line)
            rid, texts = request.get("id"), request.get("texts")
            if not isinstance(texts, list) or not all(isinstance(t, str) for t in texts):
                raise ValueError("texts must be a list of strings")
            # Version 1 template: Qwen retrieval instruction for queries; card-side
            # text is passed unchanged. Keep the template in sync with index metadata.
            prepared = texts
            if request.get("query"):
                instruction = "Instruct: Retrieve relevant knowledge cards that answer the user's query.\nQuery: "
                prepared = [instruction + text for text in texts]
            vectors = model.encode(prepared, normalize_embeddings=True, convert_to_numpy=True, show_progress_bar=False)
            send({"id": rid, "vectors": vectors.tolist()})
        except Exception:
            send({"id": locals().get("rid"), "error": {"code": "EMBED_INFERENCE", "message": "Local model inference failed", "recoverable": True}})


if __name__ == "__main__":
    raise SystemExit(main())
