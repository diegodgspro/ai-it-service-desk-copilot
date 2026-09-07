"""Optional developer utility. Run the app first, then install playwright + Chromium.

python -m pip install playwright
python -m playwright install chromium
python scripts/capture_screenshots.py

These are local browser captures, with no employer or production data.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/screenshots'
OUT.mkdir(exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 1600, 'height': 1400}, device_scale_factor=1)
    page.goto('http://127.0.0.1:8501', wait_until='domcontentloaded')
    expect(page.get_by_role('button', name='Analyze Ticket', exact=True)).to_be_visible(timeout=30000)
    page.screenshot(path=str(OUT/'01-incoming.png'))
    page.get_by_role('button',name='Analyze Ticket',exact=True).click()
    expect(page.get_by_role('tab',name='01 · Analysis',exact=True)).to_be_visible(timeout=30000)
    page.screenshot(path=str(OUT/'02-analysis.png'))
    page.get_by_role('tab',name='02 · Troubleshooting',exact=True).click()
    expect(page.get_by_role('heading',name='Recommended troubleshooting',exact=True)).to_be_visible()
    page.screenshot(path=str(OUT/'03-troubleshooting.png'))
    page.get_by_role('combobox',name='Incoming incident',exact=True).click()
    page.get_by_role('option',name='INC-1044 · Warehouse printer appears offline',exact=True).click()
    page.get_by_role('button',name='Analyze Ticket',exact=True).click()
    page.get_by_role('tab',name='03 · Automation',exact=True).click()
    page.get_by_role('button',name='Approve simulation',exact=True).click()
    expect(page.get_by_text('SIMULATED: proposed spooler restart recorded. No services were changed.',exact=True)).to_be_visible(timeout=30000)
    page.screenshot(path=str(OUT/'04-automation.png'))
    browser.close()
print(f'Four actual dashboard screenshots saved to {OUT}. Review images before publishing.')
