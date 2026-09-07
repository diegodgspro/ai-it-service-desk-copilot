# ITSM connector contract

Only `MockConnector` works end to end. The other four adapters raise `NotImplementedError`; they are explicit extension scaffolds, not tested integrations.

| Internal concept | Adapter responsibility |
|---|---|
| `Ticket.id` | Retain a stable external reference and separately preserve the vendor's write identifier |
| title / description | Normalize subject and body; omit secrets and irrelevant personal data |
| impact / urgency | Map configured vendor values to Low / Medium / High; never assume numeric scales match |
| requester | Use a minimal display name or pseudonym |
| status | Translate a reviewed internal transition to the vendor workflow |
| technician note | Separate private notes from public responses; require review before any external send |

`TicketConnector` defines `list_tickets`, `get_ticket` and `update_ticket`. The mock implements all three and stores notes in memory. A production adapter would implement the same protocol with the vendor's supported API for the deployed version.

Implementation checklist: least-privilege service identity; credentials from environment or secret manager; explicit response schemas; pagination; timeouts; bounded retries with backoff for transient failures; idempotency for writes; audit records without ticket bodies or secrets; workflow authorization and sandbox contract tests. Do not retry a non-idempotent write blindly.

Possible adapters: ServiceNow incident records, Jira Service Management requests/issues, GLPI tickets, OTRS / Znuny GenericInterface. Endpoint paths and authentication are intentionally not hardcoded because deployment versions and configuration differ. No network request to an ITSM service is made by this project.
