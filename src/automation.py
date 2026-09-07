"""Allowlisted simulation only. No subprocess, shell, network probe or service changes."""
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from uuid import uuid4

ACTIONS = {
    "network-diagnostics": {"title": "Review network diagnostics", "script": "Get-SupportDiagnostics.ps1", "risk": "Read-only locally; output may include internal addresses.", "preview": "Get-NetAdapter; Get-DnsClientServerAddress", "result": "SIMULATED: adapter Up; DNS configured. Connectivity has not actually been tested."},
    "dns-diagnostics": {"title": "Inspect DNS / propose cache flush", "script": "Clear-DnsCache.ps1", "risk": "A cache flush affects name-resolution state; approval required.", "preview": ".\\automation\\Clear-DnsCache.ps1  # Dry run by default", "result": "SIMULATED: proposed cache flush recorded. DNS cache was not changed."},
    "spooler-review": {"title": "Review Print Spooler restart", "script": "Restart-PrintSpooler.ps1", "risk": "A restart interrupts printing. Confirm affected users and pending jobs.", "preview": ".\\automation\\Restart-PrintSpooler.ps1  # Dry run by default", "result": "SIMULATED: proposed spooler restart recorded. No services were changed."},
    "system-diagnostics": {"title": "Gather endpoint health", "script": "Get-SupportDiagnostics.ps1", "risk": "Read-only locally; review output before sharing.", "preview": "Get-CimInstance Win32_LogicalDisk; Get-Service Spooler", "result": "SIMULATED: disk free 8 GB; spooler Running. These are synthetic values."},
    "identity-review": {"title": "Identity verification checklist", "script": None, "risk": "No account unlock, password reset or MFA bypass is implemented.", "preview": "Verify identity → inspect authorized sign-in logs → request approved remediation", "result": "SIMULATED: identity review checklist acknowledged. No accounts were modified."},
}

@dataclass(frozen=True)
class AuditEvent:
    event_id: str
    ticket_id: str
    action_id: str
    decision: str
    timestamp: str
    result: str
    mode: str = "simulation"

    def to_dict(self):
        return asdict(self)

def decide(ticket_id, action_id, decision):
    if action_id not in ACTIONS or decision not in {"approved", "rejected"}:
        raise ValueError("Unknown action or decision")
    result = ACTIONS[action_id]["result"] if decision == "approved" else "REJECTED: no action was performed."
    return AuditEvent(str(uuid4()), ticket_id, action_id, decision, datetime.now(timezone.utc).isoformat(), result)
