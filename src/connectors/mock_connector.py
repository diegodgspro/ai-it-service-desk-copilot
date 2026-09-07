import json
from dataclasses import replace
from src.engine import ROOT
from src.models import Ticket

class MockConnector:
    """Session-local read/write integration. Reloading the session resets all records."""
    def __init__(self):
        self.tickets = {row["id"]: Ticket(**row) for row in json.loads((ROOT / "sample_data/tickets.json").read_text())}
        self.notes = []

    def list_tickets(self):
        return list(self.tickets.values())

    def get_ticket(self, ticket_id):
        return self.tickets[ticket_id]

    def update_ticket(self, ticket_id, decision, note, validated=False):
        if decision not in {"In progress", "Escalated", "Resolved"}:
            raise ValueError("Unsupported status")
        if decision == "Resolved" and not validated:
            raise ValueError("Resolution requires explicit user validation.")
        if not note.strip() or len(note) > 5000:
            raise ValueError("A bounded technician note is required.")
        ticket = self.get_ticket(ticket_id)
        self.tickets[ticket_id] = replace(ticket, status=decision)
        self.notes.append({"ticket_id": ticket_id, "status": decision, "note": note, "user_validated": validated})
        return self.tickets[ticket_id]
