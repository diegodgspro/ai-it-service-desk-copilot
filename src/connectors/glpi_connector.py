class GLPIConnector:
    """Extension scaffold only; no production integration is claimed."""
    def list_tickets(self):
        raise NotImplementedError("Configure and implement a reviewed GLPI API adapter first.")

    def get_ticket(self, ticket_id):
        raise NotImplementedError("Map the vendor record to src.models.Ticket.")

    def update_ticket(self, ticket_id, decision, note, validated=False):
        raise NotImplementedError("Implement approved writes, idempotency and permission checks.")
