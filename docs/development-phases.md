# Build phases and verification map

The repository is delivered as a complete MVP. Each phase is reviewable independently; no phase requires a paid provider.

| Phase | Files / deliverable | How to verify |
|---|---|---|
| 1 · Definition | `docs/architecture/architecture.md` | Trace ticket → provider → technician → mock |
| 2 · Structure and tickets | `src/models.py`, `sample_data/tickets.json` | Open all eight tickets in the sidebar |
| 3 · Knowledge | `knowledge_base/*.md` | Open articles in Troubleshooting |
| 4 · Analysis | `src/engine.py`, `src/providers.py`, training/profiles JSON | `python -m pytest tests/test_engine.py tests/test_providers.py -q` |
| 5 · Dashboard | `app.py`, `.streamlit/config.toml` | `python -m streamlit run app.py` |
| 6 · Automation | `src/automation.py`, `automation/*.ps1` | Approve/reject and inspect synthetic audit; Windows manual checks below |
| 7 · Connectors | `src/connectors/*.py` | Save a mock handover and export incident evidence |
| 8 · Tests | `tests/`, `.github/workflows/tests.yml` | `python -m pytest -q` |
| 9 · Portfolio | `README.md`, `docs/interview-talking-points.md` | Follow setup from a clean extracted folder |
| 10 · Demonstration | `docs/demo-images/`, `docs/screenshots/`, `docs/linkedin/post.md` | Follow `docs/demo-guide.md`; capture actual UI locally; publish manually after replacing link |

## Windows-only manual validation (not executed during Linux build)

On an authorized lab endpoint, inspect the scripts before running:

```powershell
.\automation\Get-SupportDiagnostics.ps1
.\automation\Clear-DnsCache.ps1
.\automation\Restart-PrintSpooler.ps1
.\automation\Clear-DnsCache.ps1 -Execute -WhatIf
.\automation\Restart-PrintSpooler.ps1 -Execute -WhatIf
```

The two remediation scripts must make no changes by default; `-WhatIf` must describe the action. Actual execution requires separate authorization, suitable privileges and an agreed service-impact window. Do not bypass organizational execution policy.
