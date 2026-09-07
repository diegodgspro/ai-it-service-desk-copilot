"""Generate exact authored demo cards from actual engine output. Not UI screenshots.
Optional developer dependency: Pillow. Run from the repository root.
"""
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from PIL import Image, ImageDraw, ImageFont
from src.engine import LocalProvider, ROOT
from src.connectors.mock_connector import MockConnector
from src.automation import ACTIONS, decide
import shutil

OUT=ROOT/'docs/demo-images';OUT.mkdir(exist_ok=True)
FONT_CANDIDATES=['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','C:/Windows/Fonts/arial.ttf','/System/Library/Fonts/Supplemental/Arial.ttf']
FONT=next((p for p in FONT_CANDIDATES if Path(p).exists()),None)
if not FONT: raise SystemExit('Set FONT_CANDIDATES to an installed TrueType font.')

def font(size):return ImageFont.truetype(FONT,size)

def card(number,title,subtitle):
    im=Image.new('RGB',(1440,1200),'#0b1220');d=ImageDraw.Draw(im)
    d.text((64,42),'◈  SERVICE DESK COPILOT  /  PERSONAL PORTFOLIO LAB',font=font(20),fill='#4de0bf')
    d.text((64,95),title,font=font(46),fill='#e6edf6')
    d.text((64,158),subtitle,font=font(23),fill='#9eafc4')
    d.line((64,215,1376,215),fill='#30415a',width=2)
    d.text((64,1134),'DEMONSTRATION PREVIEW • Synthetic data • Not a dashboard screenshot',font=font(20),fill='#9eafc4')
    d.text((1300,1134),number,font=font(22),fill='#4de0bf')
    return im,d

def wrapped(d,text,x,y,width,size=26,color='#e6edf6',leading=12):
    words=text.split();line=''
    for word in words:
        trial=(line+' '+word).strip()
        if d.textlength(trial,font=font(size))>width and line:
            d.text((x,y),line,font=font(size),fill=color);y+=size+leading;line=word
        else:line=trial
    if line:d.text((x,y),line,font=font(size),fill=color);y+=size+leading
    return y

def panel(d,x,y,w,h,label,value):
    d.rounded_rectangle((x,y,x+w,y+h),radius=14,fill='#131f31',outline='#30415a',width=2)
    d.text((x+24,y+20),label,font=font(19),fill='#9eafc4')
    wrapped(d,value,x+24,y+59,w-48,size=33,color='#4de0bf')

def section(d,label,text,y):
    d.text((64,y),label,font=font(21),fill='#4de0bf')
    return wrapped(d,text,64,y+44,1300)+32

connector=MockConnector();ticket=connector.get_ticket('INC-1042');a=LocalProvider().analyze(ticket)
im,d=card('01 / 06','Start with the incident.','A support workflow grounded in symptoms, scope and business impact.')
y=section(d,ticket.id+'  /  '+ticket.requester,ticket.title,260)
y=section(d,'ORIGINAL REPORT',ticket.description,y+15)
for x,label,value in [(64,'IMPACT',ticket.impact),(512,'URGENCY',ticket.urgency),(960,'SOURCE','Mock ITSM')]:panel(d,x,650,416,145,label,value)
section(d,'TECHNICIAN CONTROL','Impact and urgency remain visible and editable. No incident is resolved just because a model suggests a fix.',850)
im.save(OUT/'01-incoming-preview.png')
im,d=card('02 / 06','Make the recommendation explainable.','Actual output from the local classifier and deterministic priority policy.')
for x,label,value in [(64,'PRIORITY',a.priority),(512,'CATEGORY',a.category),(960,'CLASSIFIER SCORE',f'{a.confidence_score:.0%}')]:panel(d,x,265,416,145,label,value)
y=section(d,'WORKING HYPOTHESIS',a.probable_root_cause,470)
y=section(d,'ROUTING',a.escalation_reason,y)
y=section(d,'HOW TO READ THE SCORE','Uncalibrated classifier output from 40 synthetic training examples. It is not a probability that the proposed root cause is correct.',y)
wrapped(d,'Low impact × High urgency → P3 under this illustrative policy.',64,1000,1300,size=23,color='#4de0bf')
im.save(OUT/'02-analysis-preview.png')
im,d=card('03 / 06','Turn knowledge into an investigation.','VPN runbook • Versioned Markdown • Evidence before remediation')
y=255
for i,step in enumerate(a.troubleshooting_steps,1):
 d.text((64,y),f'{i:02d}',font=font(27),fill='#4de0bf')
 y=wrapped(d,step,135,y,1210,size=26)+25
section(d,'KNOWLEDGE EVIDENCE',' · '.join(article['path'] for article in a.knowledge_articles),y+20)
im.save(OUT/'03-troubleshooting-preview.png')
ticket=connector.get_ticket('INC-1044');a=LocalProvider().analyze(ticket);action=ACTIONS[a.suggested_automation]
event=decide(ticket.id,a.suggested_automation,'approved')
im,d=card('04 / 06','Keep the technician in control.','Printer incident • Human approval • No live service changes')
y=section(d,ticket.id+'  /  AUTOMATION RECOMMENDATION',action['title'],265)
y=section(d,'REVIEW THE IMPACT',action['risk'],y)
panel(d,64,y,1312,135,'HUMAN DECISION','APPROVED — SIMULATION ONLY');y+=185
y=section(d,'ACTUAL SIMULATION OUTPUT',event.result,y)
section(d,'WINDOWS LAB SCRIPTS','The separate PowerShell remediation example defaults to dry run. Actual execution requires an explicit switch and confirmation on an authorized endpoint.',y)
im.save(OUT/'04-automation-preview.png')
shutil.copyfile(ROOT/'docs/architecture/architecture.png',OUT/'05-architecture.png')
im,d=card('06 / 06','An inspectable support portfolio.','Repository overview • Local source files • Ready for GitHub review')
y=section(d,'PROJECT','AI-Powered IT Service Desk Copilot',260)
for label,text in [
 ('SUPPORT KNOWLEDGE','Eight incident scenarios, nine articles, priority policy, troubleshooting and escalation.'),
 ('WORKING SOFTWARE','Streamlit dashboard, local ML, mock read/write integration, JSON evidence export and approval simulation.'),
 ('TECHNICAL EVIDENCE','Regression tests, a provider boundary, PowerShell lab examples and explicit integration scaffolds.'),
 ('HONEST LIMITS','Personal project. Synthetic data. No production claims. Optional Ollama and Windows execution need separate live validation.')]:
 y=section(d,label,text,y)
im.save(OUT/'06-repository-preview.png')
print('Generated six labeled demonstration images')
