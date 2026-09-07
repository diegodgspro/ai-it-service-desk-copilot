# Capture actual dashboard screenshots

**Actual application screenshots could not be captured in the build environment.** The cloud browser could not open the local application and a local Chromium download failed. The Streamlit interaction tests passed, but they do not verify visual layout.

Six ready-to-use **demonstration images** are in `../demo-images/`. Those are authored visual summaries generated from real local engine output, with explicit preview labels; they are **not screenshots of the Streamlit UI or a published GitHub repository**. The architecture image is an authored technical diagram.

Capture the actual UI on your PC after running the application:

| File | Exact capture |
|---|---|
| 01-incoming.png | Select INC-1042, before analysis: original symptom, impact and urgency |
| 02-analysis.png | Click Analyze Ticket, open Analysis: P3, category, hypothesis, score limitation |
| 03-troubleshooting.png | Open Troubleshooting: steps and knowledge articles |
| 04-automation.png | Select INC-1044, analyze, open Automation and Approve simulation; retain the SIMULATED result |
| 05-architecture.png | Included authored architecture diagram; alternatively capture the Architecture tab |
| 06-github.png | After publishing, capture your actual GitHub README; never fabricate a live repository view |

Manual capture: use a desktop browser at approximately 1600 × 1400. Keep the score limitation and SIMULATION label visible. Inspect each screenshot for cut-off text and sensitive data.

Optional automated capture (requires separately installed Chromium):

```bash
python -m pip install playwright
python -m playwright install chromium
python scripts/capture_screenshots.py
```

Run the application in another terminal first. The capture utility is included but was not executed successfully in the build environment. Review and adjust it if your installed browser changes control behavior. It captures the first four images only.

For LinkedIn, use either the clearly labeled demonstration images or your real UI screenshots, then the architecture diagram. Follow `docs/demo-guide.md` and replace the GitHub placeholder before publishing.
