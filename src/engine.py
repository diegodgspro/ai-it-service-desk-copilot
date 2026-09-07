"""Small, inspectable local ML classifier + document retrieval + support policy."""
import json
import re
from functools import lru_cache
from pathlib import Path
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics.pairwise import cosine_similarity
from src.models import Analysis, Ticket

ROOT = Path(__file__).resolve().parents[1]
MATRIX = {"High": {"High": "P1", "Medium": "P2", "Low": "P3"},
          "Medium": {"High": "P2", "Medium": "P3", "Low": "P4"},
          "Low": {"High": "P3", "Medium": "P4", "Low": "P4"}}
TARGETS = {"P1": "15 minutes", "P2": "1 hour", "P3": "4 business hours", "P4": "1 business day"}

def priority(impact, urgency):
    return MATRIX[impact][urgency]

@lru_cache(maxsize=1)
def assets():
    training = json.loads((ROOT / "sample_data/training.json").read_text())
    vectorizer = TfidfVectorizer(ngram_range=(1, 2), stop_words="english")
    matrix = vectorizer.fit_transform([r["text"] for r in training])
    model = LogisticRegression(C=6, random_state=42, max_iter=500)
    model.fit(matrix, [r["label"] for r in training])
    articles = sorted((ROOT / "knowledge_base").glob("*.md"))
    docs = [p.read_text() for p in articles]
    kb_vectorizer = TfidfVectorizer(stop_words="english", ngram_range=(1, 2))
    kb_matrix = kb_vectorizer.fit_transform(docs)
    profiles = json.loads((ROOT / "sample_data/profiles.json").read_text())
    return vectorizer, matrix, model, articles, docs, kb_vectorizer, kb_matrix, profiles

class LocalProvider:
    name = "Local ML + knowledge base"

    def analyze(self, ticket: Ticket) -> Analysis:
        vec, train, model, paths, docs, kbvec, kbmat, profiles = assets()
        text = ticket.title + " " + ticket.description
        query = vec.transform([text])
        probabilities = model.predict_proba(query)[0]
        best = int(probabilities.argmax())
        label = model.classes_[best]
        score = float(probabilities[best])
        similarity = float(cosine_similarity(query, train).max())
        # This is a rejection heuristic, not a calibrated uncertainty estimate.
        uncertain = similarity < .16 or score < .30
        security = bool(re.search(r"ransomware|phishing|suspicious|compromis|malware|stolen|unexpected mfa", text, re.I))
        profile = profiles[label]
        runbook = docs[next(i for i, path in enumerate(paths) if path.stem == label)]
        runbook_steps = re.findall(r"^\d+\. (.+)$", runbook, re.M)
        ranks = cosine_similarity(kbvec.transform([text]), kbmat)[0]
        indices = [i for i in ranks.argsort()[::-1] if ranks[i] > .025][:2]
        articles = [{"path": "knowledge_base/" + paths[i].name, "title": docs[i].splitlines()[0].lstrip("# "),
                     "score": round(float(ranks[i]), 3), "content": docs[i]} for i in indices]
        # Include the actual runbook used to construct the recommendation.
        if not uncertain and not security and not any(a["path"].endswith(label + ".md") for a in articles):
            i = next(i for i,p in enumerate(paths) if p.stem == label)
            articles = [{"path": "knowledge_base/" + paths[i].name, "title": docs[i].splitlines()[0].lstrip("# "),
                         "score": round(float(ranks[i]), 3), "content": docs[i]}] + articles[:1]
        p = priority(ticket.impact, ticket.urgency)
        escalation = uncertain or security or p in {"P1", "P2"} or label == "erp-access"
        reason = ("Security indicators require the approved security escalation process." if security else
                  "Insufficient model evidence; manual triage required." if uncertain else
                  "Business impact or application ownership requires specialist review." if escalation else
                  "Continue within the service desk runbook; escalate if unresolved.")
        steps = (["Record the symptoms, scope and timeline without collecting secrets.",
                  "Route the incident to the appropriate specialist for manual assessment."] if uncertain or security else runbook_steps)
        cause = "Not established; collect evidence before proposing a cause." if uncertain or security else profile["cause"]
        response = (f"Hello {ticket.requester}, thank you for reporting this issue. "
                    f"We have recorded the impact as {ticket.impact.lower()} and the urgency as {ticket.urgency.lower()}. "
                    "The cause has not yet been confirmed. "
                    + ("We recommend specialist review and will share an update after assessment. " if escalation else
                       "Our next step is to follow the recommended diagnostics and confirm the findings with you. ")
                    + "Please share the exact error and when it started, but do not send passwords or MFA codes.")
        return Analysis(ticket.id, ticket.title, "Security review" if security else "Manual triage" if uncertain else profile["category"],
                        "Needs investigation" if uncertain or security else profile["subcategory"], p, ticket.impact, ticket.urgency,
                        cause, round(score, 3), "Uncalibrated classifier score; not root-cause confidence",
                        steps, articles, None if uncertain or security else profile["action"], escalation, reason,
                        response, self.name, TARGETS[p])
