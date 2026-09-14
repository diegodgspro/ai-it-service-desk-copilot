"""Compare two document-level challenge annotations without running retrieval."""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path


def cohen_kappa(left: list[bool], right: list[bool]) -> float:
    observed = sum(a == b for a, b in zip(left, right, strict=True)) / len(left)
    left_rate = sum(left) / len(left)
    right_rate = sum(right) / len(right)
    expected = left_rate * right_rate + (1 - left_rate) * (1 - right_rate)
    return 1.0 if expected == 1 else (observed - expected) / (1 - expected)


def quadratic_weighted_kappa(left: list[int], right: list[int], maximum: int = 3) -> float:
    observed = sum(((a - b) / maximum) ** 2 for a, b in zip(left, right, strict=True)) / len(left)
    left_counts = Counter(left)
    right_counts = Counter(right)
    total = len(left)
    expected = sum(
        ((a - b) / maximum) ** 2 * left_counts[a] * right_counts[b] / (total * total)
        for a in range(maximum + 1)
        for b in range(maximum + 1)
    )
    return 1.0 if expected == 0 else 1 - observed / expected


def grade_map(case: dict, field: str) -> dict[str, int]:
    if field == "relevance":
        return {item["documentId"]: item["grade"] for item in case[field] if "chunkId" not in item}
    return {item["documentId"]: item["grade"] for item in case[field]}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("original", type=Path)
    parser.add_argument("second", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    original = json.loads(args.original.read_text(encoding="utf-8"))["cases"]
    second = json.loads(args.second.read_text(encoding="utf-8"))["annotations"]
    assert [case["caseId"] for case in original] == [case["caseId"] for case in second]

    abstention_left = [case["expectedAbstention"] for case in original]
    abstention_right = [case["expectedAbstention"] for case in second]
    exact_sets = 0
    jaccards: list[float] = []
    ordinal_left: list[int] = []
    ordinal_right: list[int] = []
    disagreements = []
    by_category: dict[str, Counter] = defaultdict(Counter)

    for first, latter in zip(original, second, strict=True):
        first_grades = grade_map(first, "relevance")
        second_grades = grade_map(latter, "relevantDocuments")
        first_set = set(first_grades)
        second_set = set(second_grades)
        union = first_set | second_set
        exact_sets += first_set == second_set
        jaccards.append(1.0 if not union else len(first_set & second_set) / len(union))
        for document_id in sorted(union):
            ordinal_left.append(first_grades.get(document_id, 0))
            ordinal_right.append(second_grades.get(document_id, 0))
        abstention_diff = first["expectedAbstention"] != latter["expectedAbstention"]
        set_diff = first_set != second_set
        grade_diffs = {
            document_id: [first_grades.get(document_id, 0), second_grades.get(document_id, 0)]
            for document_id in sorted(union)
            if first_grades.get(document_id, 0) != second_grades.get(document_id, 0)
        }
        material_grade_diff = any(abs(pair[0] - pair[1]) > 1 for pair in grade_diffs.values())
        if abstention_diff or set_diff or grade_diffs:
            by_category[first["category"]]["casesWithAnyDisagreement"] += 1
            by_category[first["category"]]["abstention"] += abstention_diff
            by_category[first["category"]]["documentSet"] += set_diff
            by_category[first["category"]]["grade"] += bool(grade_diffs)
            disagreements.append({
                "caseId": first["caseId"],
                "category": first["category"],
                "hasMetadataFilters": bool(first["metadataFilters"]),
                "originalAbstention": first["expectedAbstention"],
                "secondAbstention": latter["expectedAbstention"],
                "originalDocuments": first_grades,
                "secondDocuments": second_grades,
                "gradeDifferences": grade_diffs,
                "materialGradeDifference": material_grade_diff,
                "originalRationale": first["rationale"],
                "secondRationale": latter["rationale"],
            })

    output = {
        "cases": len(original),
        "abstentionExactAgreement": sum(a == b for a, b in zip(abstention_left, abstention_right, strict=True)) / len(original),
        "abstentionCohensKappa": cohen_kappa(abstention_left, abstention_right),
        "documentSetExactAgreement": exact_sets / len(original),
        "documentSetMacroJaccard": sum(jaccards) / len(jaccards),
        "ordinalQuadraticWeightedKappa": quadratic_weighted_kappa(ordinal_left, ordinal_right),
        "ordinalJudgmentPairs": len(ordinal_left),
        "categories": {category: dict(counts) for category, counts in sorted(by_category.items())},
        "metadataFilterDisagreements": sum(item["hasMetadataFilters"] for item in disagreements),
        "multipleGoldDisagreements": sum(len(item["originalDocuments"]) > 1 or len(item["secondDocuments"]) > 1 for item in disagreements),
        "materialGradeDifferenceCases": sum(item["materialGradeDifference"] for item in disagreements),
        "disagreements": disagreements,
    }
    rendered = json.dumps(output, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.write_text(rendered, encoding="utf-8", newline="\n")
    else:
        print(rendered, end="")


if __name__ == "__main__":
    main()
