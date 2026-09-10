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

## Windows validation, 2026-09-07

The user reported successfully running the application on Windows and passing all 29 tests in the active virtual environment. The report did not specify a Python patch version.

During publication preparation, `.venv\Scripts\python.exe` was inspected directly: the project virtual environment reports **Python 3.13.15**. A separate run of `.\.venv\Scripts\python.exe -m pytest -q` returned **29 passed in 2.24s**. This patch version belongs to the inspected interpreter, not an assumption about the earlier user run. No application code changes were needed.

Setup was checked against `requirements.txt` (Streamlit, scikit-learn and python-dotenv) and `requirements-dev.txt` (runtime requirements plus pytest). On Windows, install tests with `.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt`. Pillow and Playwright/Chromium are optional image utilities, not required for application startup or regression tests.

## Remaining checks and honest limits

- **Browser visual QA / real UI screenshots:** blocked in this environment. The cloud browser could not access localhost; local Chromium download failed. Streamlit AppTest verifies widget behavior, not rendered layout. A screenshot utility and manual capture guide are included for the user's PC.
- **Live Ollama generation:** not tested; no model was available. The actual HTTP adapter is implemented and contract-tested using mocked responses.
- **PowerShell execution:** not tested on Windows. The dashboard never executes these scripts. Review and test dry-run / WhatIf behavior in an authorized lab before considering actual execution.
- **ITSM production integrations:** not implemented. Only the session-local mock reads and writes tickets.
- **Remote GitHub CI:** configured for Python 3.11, 3.12 and 3.13. Consult GitHub Actions for the result associated with each published commit.
- **Screenshot utility:** provided for local use, not verified with an actual Chromium instance here.

## Interpretation

The 29 tests are functional regression checks, not a model-performance benchmark. The eight scenario fixtures are authored separately from the 40 training examples but share designed support domains. No independent accuracy, root-cause confidence, time reduction or SLA improvement has been measured. All screenshots or posts should retain this distinction.

## DeskPilot v1.0.0 production checkpoint — 2026-09-10

Production: https://deskpilot.diegodgspro.workers.dev

The earlier Linux limitations above describe the initial Python build. Web browser verification now runs locally in Edge and in CI Chromium: six scenarios cover desktop/mobile workflow and mocked OAuth. Real interface captures are generated in ignored test output, not committed as screenshots. The web suite also has 39 Worker/D1 checks and 16 frontend tests; the Python suite remains 29 tests. TypeScript, production builds and npm audit are release gates. No line-coverage percentage is claimed.

The user accepted production Auth0 login, authenticated reads, a write persisted after reload and logout. Remote D1 has both initial migrations applied and eight expected synthetic incidents. Audit identities remain private. The release rerun passed all 29 Python, 39 Worker/D1, 16 frontend and six Edge browser tests, type checking, clean build and guarded production build; npm audit returned zero vulnerabilities. Public landing/assets returned 200 and unauthenticated API probes returned 401. The final GitHub Release records CI, deployed commit and operational checkpoint. See [release scope](releases/v1.0.0.md).
