# Escalation and priority policy

This is an illustrative local policy, not a contracted SLA or an official ITIL matrix.
Impact: High = organization or multiple locations; Medium = department; Low = individual.
Urgency: High = work stopped with no viable workaround or imminent deadline; Medium = degraded work; Low = workaround available.

| Impact / Urgency | High | Medium | Low |
|---|---|---|---|
| High | P1 | P2 | P3 |
| Medium | P2 | P3 | P4 |
| Low | P3 | P4 | P4 |

Illustrative initial response targets: P1 15 minutes, P2 1 hour, P3 4 business hours, P4 1 business day.
The app displays targets only; it does not track SLA clocks or business calendars.
P1/P2 incidents require escalation. Low model evidence requires manual triage.
Suspected compromise requires security review. Never request passwords or MFA codes.
Record impact, timeline, symptoms, evidence and actions before handover. Do not close on a recommendation alone.
