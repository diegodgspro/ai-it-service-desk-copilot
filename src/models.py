from dataclasses import dataclass, asdict

@dataclass(frozen=True)
class Ticket:
    id: str
    title: str
    description: str
    requester: str
    impact: str
    urgency: str
    source: str = "mock"
    status: str = "Open"

    def __post_init__(self):
        if self.impact not in {"Low", "Medium", "High"} or self.urgency not in {"Low", "Medium", "High"}:
            raise ValueError("Impact and urgency must be Low, Medium or High.")
        for name in ("id", "title", "description", "requester"):
            value = getattr(self, name)
            if not isinstance(value, str) or not value.strip() or len(value) > 5000:
                raise ValueError(f"Invalid {name}.")

@dataclass(frozen=True)
class Analysis:
    ticket_id: str
    issue_summary: str
    category: str
    subcategory: str
    priority: str
    impact: str
    urgency: str
    probable_root_cause: str
    confidence_score: float
    confidence_label: str
    troubleshooting_steps: list[str]
    knowledge_articles: list[dict]
    suggested_automation: str | None
    escalation_required: bool
    escalation_reason: str
    suggested_response: str
    provider: str
    response_target: str

    def to_dict(self):
        return asdict(self)
