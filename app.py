"""Run with: python -m streamlit run app.py"""
import json
from dataclasses import replace
import streamlit as st
from dotenv import load_dotenv
from src.engine import ROOT, LocalProvider
from src.providers import OllamaProvider, ProviderError
from src.connectors.mock_connector import MockConnector
from src.automation import ACTIONS, decide

load_dotenv(ROOT / ".env", override=False)
st.set_page_config(page_title="IT Service Desk Copilot", page_icon="◈", layout="wide")
st.markdown("""<style>
.block-container {padding-top:2rem;max-width:1400px}
h1 {letter-spacing:-1.8px} h2 {letter-spacing:-.7px}
[data-testid="stMetric"] {background:#131f31;border:1px solid #293850;border-radius:12px;padding:16px}
[data-testid="stSidebar"] {border-right:1px solid #293850}
.hero-label {color:#4de0bf;font-size:12px;letter-spacing:2px;font-weight:700}
.hero-sub {color:#9eafc4;font-size:18px;margin-bottom:24px}
</style>""", unsafe_allow_html=True)
if "connector" not in st.session_state:
    st.session_state.connector = MockConnector()
    st.session_state.analyses = {}
    st.session_state.events = []
connector = st.session_state.connector
with st.sidebar:
    st.markdown("## ◈ Service Desk\n**COPILOT / PORTFOLIO LAB**")
    st.caption("Intelligent triage. Technician control.")
    st.divider()
    selected = st.selectbox("Incoming incident", [t.id for t in connector.list_tickets()], index=1,
                            format_func=lambda tid: f"{tid} · {connector.get_ticket(tid).title}")
    provider_mode = st.selectbox("Analysis provider", ["Local ML + knowledge base", "Ollama (local LLM)"])
    st.info("Synthetic data • Mock ITSM\n\nAutomation is simulation only.")
    st.caption("Local ML uses TF-IDF + logistic regression. It does not require API credentials.")
    st.divider()
    st.markdown("**Support domains**\n\nIdentity · Network · Endpoint\n\nPrinting · Access · Applications")
    st.caption("Personal portfolio project. No employer systems or production outcomes.")

st.markdown('<div class="hero-label">SUPPORT OPERATIONS / HUMAN-IN-THE-LOOP</div>', unsafe_allow_html=True)
st.title("AI-Powered IT Service Desk Copilot")
st.markdown('<div class="hero-sub">From incoming incident to an evidence-led support plan.</div>', unsafe_allow_html=True)
base_ticket = connector.get_ticket(selected)
a,b,c,d=st.columns(4)
a.metric("Demo incidents", "08")
b.metric("Knowledge articles", "09")
c.metric("Live system changes", "0")
d.metric("Incident status", base_ticket.status)
with st.container(border=True):
    st.subheader(f"{base_ticket.id} · {base_ticket.title}")
    st.caption(f"Requester: {base_ticket.requester}  |  Source: Mock connector  |  Company: Northstar Demo")
    description = st.text_area("Incident description", base_ticket.description, key=f"description-{selected}", height=105, max_chars=5000)
    a,b,c = st.columns([1,1,2])
    impact = a.selectbox("Impact", ["Low","Medium","High"], index=["Low","Medium","High"].index(base_ticket.impact), key=f"impact-{selected}")
    urgency = b.selectbox("Urgency", ["Low","Medium","High"], index=["Low","Medium","High"].index(base_ticket.urgency), key=f"urgency-{selected}")
    c.caption("Impact: individual / department / organization.\n\nUrgency: workaround / degraded work / stopped or imminent deadline.")
    analyze = st.button("Analyze Ticket", type="primary", disabled=not description.strip())
    st.caption("Use synthetic descriptions only. Editing input invalidates previous analysis and approval.")

fingerprint = (description,impact,urgency,provider_mode)
key = selected
cached = st.session_state.analyses.get(key)
if cached and cached[0] != fingerprint:
    st.session_state.analyses.pop(key, None)
    st.session_state.pop(f"decision-{key}", None)
    cached = None
if analyze:
    ticket = replace(base_ticket, description=description, impact=impact, urgency=urgency)
    with st.spinner("Classifying incident and retrieving support knowledge…"):
        try:
            provider = LocalProvider() if provider_mode.startswith("Local") else OllamaProvider()
            result = provider.analyze(ticket)
            st.session_state.analyses[key] = (fingerprint, result)
            # Approval is tied to a specific analysis and is reset on reanalysis.
            st.session_state.pop(f"decision-{key}", None)
            cached = (fingerprint, result)
        except (ProviderError, ValueError) as exc:
            st.error(str(exc))
            st.session_state.analyses.pop(key, None)
            cached = None
if not cached or cached[0] != fingerprint:
    st.info("Ready for triage. Select an incident and analyze it to build a support plan.")
    st.stop()
result=cached[1]
st.caption(f"PROVIDER: {result.provider} · Recommendations require technician review")
tabs=st.tabs(["01 · Analysis", "02 · Troubleshooting", "03 · Automation", "04 · Response & handover", "05 · Architecture"])
with tabs[0]:
    a,b,c=st.columns(3)
    a.metric("Recommended priority",result.priority)
    b.metric("Classification",result.category)
    c.metric("Classifier score",f"{result.confidence_score:.0%}")
    st.caption(result.confidence_label + ". Trained on 40 synthetic examples; no production accuracy claim.")
    a,b=st.columns([1.5,1])
    with a:
        st.subheader("Probable cause · working hypothesis")
        st.write(result.probable_root_cause)
        st.markdown(f"**Subcategory:** {result.subcategory}")
        st.markdown(f"**Impact / urgency:** {result.impact} / {result.urgency}")
    with b:
        st.subheader("Routing & service target")
        (st.warning if result.escalation_required else st.success)("Specialist review recommended" if result.escalation_required else "Service desk investigation")
        st.write(result.escalation_reason)
        st.caption(f"Illustrative initial response target: {result.response_target}. No SLA timer is running.")
with tabs[1]:
    left,right=st.columns([1.2,1])
    with left:
        st.subheader("Recommended troubleshooting")
        for i,step in enumerate(result.troubleshooting_steps,1):
            st.markdown(f"**{i:02d}**  {step}")
        st.info("Validate the hypothesis before changing the endpoint. Record the outcome of each step.")
    with right:
        st.subheader("Knowledge evidence")
        if not result.knowledge_articles:
            st.warning("No sufficiently relevant article found. Manual triage required.")
        for article in result.knowledge_articles:
            with st.expander(article["title"],expanded=False):
                st.caption(f"{article['path']} · cosine similarity {article['score']:.3f}")
                st.markdown(article["content"])
        st.caption("TF-IDF retrieval over versioned Markdown articles; no vector database.")
with tabs[2]:
    st.subheader("Automation review")
    if result.suggested_automation:
        action=ACTIONS[result.suggested_automation]
        st.markdown(f"### {action['title']}")
        st.warning("Human approval required · SIMULATION ONLY")
        st.write(action["risk"])
        st.code(action["preview"],language="powershell")
        st.caption("Approval records a synthetic result. The dashboard cannot execute PowerShell or modify accounts, services or network settings.")
        decision_key=f"decision-{key}"
        a,b=st.columns(2)
        approved=a.button("Approve simulation",disabled=decision_key in st.session_state,key=f"approve-{key}")
        rejected=b.button("Reject action",disabled=decision_key in st.session_state,key=f"reject-{key}")
        if approved or rejected:
            event=decide(key,result.suggested_automation,"approved" if approved else "rejected")
            st.session_state.events.append(event.to_dict())
            st.session_state[decision_key]=event.to_dict()
            st.rerun()
        if decision_key in st.session_state:
            event=st.session_state[decision_key]
            st.info(event["result"])
            st.caption(f"Decision: {event['decision']} · {event['timestamp']}")
        if action["script"]:
            with st.expander("Review the standalone Windows lab script"):
                st.code((ROOT/"automation"/action["script"]).read_text(),language="powershell")
    else:
        st.info("No automation recommended. Manual or security review is required.")
with tabs[3]:
    st.subheader("Technician response draft")
    st.write(result.suggested_response)
    st.caption("Review before sending. Nothing is sent from this application.")
    st.download_button("Download response",result.suggested_response,file_name=f"{key}-response.txt")
    st.divider()
    st.subheader("Mock ITSM handover")
    status=st.selectbox("Next status",["In progress","Escalated","Resolved"],key=f"status-{key}")
    validated=st.checkbox("The user has explicitly confirmed service restoration",key=f"validated-{key}")
    note=st.text_area("Technician evidence / handover note",key=f"note-{key}",placeholder="Record actual lab observations and remaining questions.")
    if st.button("Save to mock connector",disabled=not note.strip() or (status=="Resolved" and not validated)):
        connector.update_ticket(key,status,note,validated)
        st.success("Saved to the session-local mock connector.")
    st.caption(f"Current mock status: {connector.get_ticket(key).status}. Session data resets on a new session. Export before closing.")
    bundle={"ticket": {**base_ticket.__dict__,"description":description,"impact":impact,"urgency":urgency,"status":connector.get_ticket(key).status},
            "analysis":result.to_dict(),"audit":[e for e in st.session_state.events if e["ticket_id"]==key],
            "notes":[n for n in connector.notes if n["ticket_id"]==key]}
    st.download_button("Export incident evidence (JSON)",json.dumps(bundle,indent=2),file_name=f"{key}-evidence.json",mime="application/json")
with tabs[4]:
    st.subheader("A small core. Replaceable integrations.")
    diagram=ROOT/"docs/architecture/architecture.png"
    if diagram.exists():
        st.image(str(diagram),width="stretch")
    st.markdown("**Working:** mock connector reads tickets and records technician handovers.\n\n**Extension scaffolds:** Jira Service Management, ServiceNow, GLPI and OTRS / Znuny.\n\n**Provider boundary:** local classifier by default; optional Ollama drafts. Priority, escalation policy and action IDs remain outside LLM control.")
