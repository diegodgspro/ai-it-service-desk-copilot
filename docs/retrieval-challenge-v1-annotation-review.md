# Independent annotation review for retrieval challenge v1.0.1

## Isolation

A mechanical blind projection exposed only case ID, query, and requested metadata filters. A fresh annotator with no inherited conversation history received that projection, the ten approved knowledge Markdown documents, the preregistered relevance rubric, and synthetic/safety rules. It was prohibited from reading the original challenge labels, previous datasets, retrieval code, thresholds, RRF parameters, model/cache files, metrics, reports, or retrieval output. It manually annotated all 80 cases. No retrieval system was executed.

Only after completion were annotations compared. A separate fresh adjudicator received the nine disagreement records, both annotations, the rubric, queries/filters, and approved corpus. It did not receive or run retrieval output and changed no query wording.

## Agreement before adjudication

- abstention exact agreement: 80/80 (`1.000`)
- Cohen's kappa for abstention: `1.000`
- exact relevant-document-set agreement: 78/80 (`0.975`)
- macro Jaccard for relevant-document sets (empty/empty defined as 1): `0.989583`
- quadratic-weighted Cohen's kappa for ordinal grades: `0.588235` across 84 case/document pairs

The ordinal statistic treats an omitted document as grade 0 and evaluates only the union of documents selected by either annotator for each case. Quadratic weights on grades 0–3 penalize larger differences more strongly while avoiding inflation from the many document identities neither annotator selected.

Nine cases had any disagreement: one `noisy_non_native`, seven `ambiguous_multi_intent`, and one `adversarial_injection`. Two had different document sets, two contained a grade difference greater than one, all nine involved multiple-document judgments by at least one annotator, and none involved metadata filters. Abstention never differed. Neither annotator nor the adjudicator marked a label as unsupported or irreducibly unclear.

## Corpus-only adjudication history

| Case | Disagreement | Final corpus-based decision |
| --- | --- | --- |
| `irc-v1-028` | Escalation policy grade 2 vs omitted | Retain policy as grade 1 contextual safety guidance; Microsoft 365 remains grade 3. |
| `irc-v1-041` | Active Directory grade 2 vs 3 | Grade 3 because account lockout is an explicit direct intent; VPN remains grade 3. |
| `irc-v1-043` | Relative ERP/Windows grades and inclusion of generic software | ERP and Windows are both grade 3 direct intents; remove redundant generic software evidence. |
| `irc-v1-044` | Active Directory grade 2 vs 3 | Grade 3 because domain lockout is explicit; Microsoft 365 remains grade 3. |
| `irc-v1-045` | VPN grade 2 vs 1 | Grade 1 contextual validation because VPN already connects; shared folder remains grade 3. |
| `irc-v1-046` | Printing/policy undergrading | ERP, printing, and escalation policy are grade 3 for two direct failures and explicit department-wide priority classification. |
| `irc-v1-047` | DNS grade 2 vs 3 | Grade 3 because hostname resolution failure is explicit; printing remains grade 3. |
| `irc-v1-050` | Escalation policy grade 2 vs 3 | Grade 3 because stated multi-site impact directly maps to P1; DNS remains grade 3. |
| `irc-v1-073` | Printing grade 2 vs 1 | Grade 1 contextual evidence; escalation policy is grade 3 because priority manipulation is the direct need. |

These decisions changed relevance grades in nine cases, document membership in two cases, and the corresponding rationales. Dataset version therefore advanced from `1.0.0` to `1.0.1`. No query, metadata filter, category, difficulty, tag, or expected-abstention value changed.

## Measurement boundary and limitations

The challenge has document-level gold labels. A later evaluation must collapse multiple chunks from the same document before limits and all top-K metrics. Chunk identity may still be checked for validity, but this dataset cannot measure chunk-level relevance.

Agreement is based on two synthetic-agent annotations and one synthetic-agent adjudication, not human subject-matter experts. The high set agreement coexists with only moderate ordinal agreement, showing that fine-grained distinctions between contextual and direct evidence remain judgment-sensitive, especially for multi-intent cases. The set remains synthetic, English-only, compact, and unsuitable as sole evidence of production quality.
