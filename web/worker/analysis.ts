import data from "../shared/data.json";
import type { Analysis, Ticket, Level } from "../shared/types";
export const matrix: Record<Level, Record<Level, string>> = {
  High: { High: "P1", Medium: "P2", Low: "P3" },
  Medium: { High: "P2", Medium: "P3", Low: "P4" },
  Low: { High: "P3", Medium: "P4", Low: "P4" },
};
export const priority = (impact: Level, urgency: Level) =>
  matrix[impact][urgency];
const rules: Record<string, RegExp> = {
  "active-directory":
    /active directory|domain (account|user)|account (locked|lockout)/i,
  "vpn-troubleshooting": /\bvpn\b/i,
  "dns-troubleshooting": /\bdns\b|resolve|hostname/i,
  "printer-troubleshooting": /printer|print queue|spooler/i,
  "windows-support": /windows 11|low disk|workstation is slow/i,
  microsoft365: /outlook|microsoft 365|office 365/i,
  "network-drive": /mapped|shared folder|network drive|\\\\files/i,
  "erp-access": /\berp\b/i,
};
const actions: Record<string, { title: string; risk: string }> = {
  "identity-review": {
    title: "Review identity verification checklist",
    risk: "No account unlock, password reset or MFA bypass is performed.",
  },
  "network-diagnostics": {
    title: "Review network diagnostics",
    risk: "Synthetic diagnostic result only. Connectivity has not been tested.",
  },
  "dns-diagnostics": {
    title: "Review DNS cache flush proposal",
    risk: "A real cache flush changes name-resolution state. This action only records a simulation.",
  },
  "spooler-review": {
    title: "Review Print Spooler restart",
    risk: "A real restart interrupts printing. Review pending jobs; this action is simulated.",
  },
  "system-diagnostics": {
    title: "Review endpoint health",
    risk: "Synthetic disk and service observations only.",
  },
};
// Future providers can draft narrative fields only. Policy is assembled separately below.
export interface NarrativeProvider {
  draft(context: {
    hypothesis: string;
    steps: string[];
    response: string;
  }): Pick<Analysis, "hypothesis" | "steps" | "response">;
}
export const deterministicProvider: NarrativeProvider = {
  draft: (context) => context,
};
export function analyze(ticket: Ticket): Analysis {
  // Use the title first to avoid incidental references (e.g. ERP in a VPN report).
  const titleHits = Object.keys(rules).filter((k) =>
    rules[k].test(ticket.title),
  );
  const hits = titleHits.length
    ? titleHits
    : Object.keys(rules).filter((k) => rules[k].test(ticket.description));
  const security =
    /ransomware|phishing|suspicious|compromis|malware|stolen|unexpected mfa/i.test(
      ticket.title + " " + ticket.description,
    );
  const key =
    hits.length === 1 && !security
      ? (hits[0] as keyof typeof data.profiles)
      : null;
  const profile = key ? data.profiles[key] : null;
  const article = key
    ? data.articles[key]
    : data.articles["escalation-guidelines"];
  const p = priority(ticket.impact, ticket.urgency);
  const escalation =
    !profile || ["P1", "P2"].includes(p) || key === "erp-access";
  const reason = security
    ? "Security indicators require specialist review."
    : !profile
      ? "No single runbook match. Manual triage is required."
      : escalation
        ? "Business impact or application ownership requires specialist review."
        : "Follow the runbook and escalate if unresolved.";
  const narrative = deterministicProvider.draft({
    hypothesis:
      profile?.cause ??
      "Not established; collect evidence before proposing a cause.",
    steps: profile
      ? Array.from(article.matchAll(/^\d+\. (.+)$/gm), (m) => m[1])
      : [
          "Record symptoms, scope and timeline without collecting secrets.",
          "Route to the appropriate specialist for manual assessment.",
        ],
    response: `Hello ${ticket.requester}, thank you for reporting this issue. We recorded ${ticket.impact.toLowerCase()} impact and ${ticket.urgency.toLowerCase()} urgency. The cause has not yet been confirmed. ${escalation ? "We recommend specialist review." : "We will follow the recommended diagnostics and validate the findings with you."} Please share the exact error and start time, without passwords or MFA codes.`,
  });
  return {
    ...narrative,
    mode: "Deterministic runbook matching",
    category: security
      ? "Security review"
      : (profile?.subcategory ?? "Manual triage"),
    priority: p,
    escalation,
    reason,
    evidence: [
      {
        title: article.split("\n")[0].replace(/^# /, ""),
        path: "knowledge_base/" + (key ?? "escalation-guidelines") + ".md",
        content: article,
      },
    ],
    action: profile ? { id: profile.action, ...actions[profile.action] } : null,
  };
}
