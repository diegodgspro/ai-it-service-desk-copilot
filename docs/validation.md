# Validation record

Build validation date: 2026-09-07. Environment: Linux, Python 3.12.

| Check | Observed result |
|---|---|
| Regression suite, `python -m pytest -q` | **29 passed** |
| Eight authored scenario fixtures | Expected subcategories returned for all eight |
| Priority policy | All nine impact × urgency combinations verified |
| Unknown/security scenarios | Manual review and no automation recommendation |
| Action decisions | Approve = explicit simulation; reject = no action; unknown IDs rejected |
| Resolution gate | Closing without user validation rejected by connector and UI |
| Streamlit interactions | Analyze, approve, reject, edit input, switch ticket, save validated resolution passed |
| Stale approval control | Editing input clears the previous analysis and decision |
| Optional provider contract | Mocked JSON validation, nonlocal endpoint rejection and immutable local policy passed |
| HTTP startup smoke | Streamlit health endpoint returned `200 ok` |
| Python syntax compilation | Passed |
| Demonstration images | Six generated and visually inspected; they are authored previews, not UI screenshots |

## Remaining checks and honest limits

- **Browser visual QA / real UI screenshots:** blocked in this environment. The cloud browser could not access localhost; local Chromium download failed. Streamlit AppTest verifies widget behavior, not rendered layout. A screenshot utility and manual capture guide are included for the user's PC.
- **Live Ollama generation:** not tested; no model was available. The actual HTTP adapter is implemented and contract-tested using mocked responses.
- **PowerShell execution:** not tested on Windows. The dashboard never executes these scripts. Review and test dry-run / WhatIf behavior in an authorized lab before considering actual execution.
- **ITSM production integrations:** not implemented. Only the session-local mock reads and writes tickets.
- **Remote GitHub CI:** configured for Python 3.11 and 3.12, not run remotely before publication.
- **Screenshot utility:** provided for local use, not verified with an actual Chromium instance here.

## Interpretation

The 29 tests are functional regression checks, not a model-performance benchmark. The eight scenario fixtures are authored separately from the 40 training examples but share designed support domains. No independent accuracy, root-cause confidence, time reduction or SLA improvement has been measured. All screenshots or posts should retain this distinction.
