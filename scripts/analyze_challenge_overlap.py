"""Describe surface-token overlap with gold documents; this is not retrieval."""

from __future__ import annotations

import json
import re
import statistics
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def tokens(value: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", value.lower()))


def main() -> None:
    challenge = json.loads((ROOT / "web/tests/retrieval-challenge-v1.json").read_text(encoding="utf-8"))
    knowledge = json.loads((ROOT / "web/shared/knowledge.json").read_text(encoding="utf-8"))
    documents = {item["documentId"]: tokens(item["content"]) for item in knowledge["documents"]}
    by_category: dict[str, list[float]] = defaultdict(list)
    zero_overlap = 0

    for case in challenge["cases"]:
        if case["expectedAbstention"]:
            continue
        query_tokens = tokens(case["query"])
        gold_tokens: set[str] = set()
        for document_id in case["acceptableDocumentIds"]:
            gold_tokens.update(documents[document_id])
        ratio = len(query_tokens & gold_tokens) / len(query_tokens)
        by_category[case["category"]].append(ratio)
        zero_overlap += ratio == 0

    output = {
        "method": "fraction of unique lower-case alphanumeric query tokens present in the union of human-labeled acceptable document text; abstention cases excluded",
        "nonAbstentionCases": sum(map(len, by_category.values())),
        "zeroOverlapCases": zero_overlap,
        "categories": {
            category: {
                "cases": len(values),
                "mean": round(statistics.mean(values), 6),
                "median": round(statistics.median(values), 6),
                "minimum": round(min(values), 6),
                "maximum": round(max(values), 6),
            }
            for category, values in sorted(by_category.items())
        },
    }
    print(json.dumps(output, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
