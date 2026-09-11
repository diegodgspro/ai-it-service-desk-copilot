import { priority } from "./analysis";
import { validateIntakeDraft, type IntakeDraft } from "../shared/intake";

export interface IntakeProvider {
  generate(description: string, requesterName: string): unknown;
}
type Profile = Pick<
  IntakeDraft,
  | "requestType"
  | "affectedService"
  | "category"
  | "subcategory"
  | "suggestedAssignmentGroup"
> & { pattern: RegExp; hypothesis: string };
const profiles: Profile[] = [
  {
    pattern:
      /active directory|account locked|locked out|password|sign[ -]?in|login/i,
    requestType: "Incident",
    affectedService: "Active Directory",
    category: "Identity and access",
    subcategory: "Account access",
    suggestedAssignmentGroup: "Identity Support",
    hypothesis:
      "An account state or credential issue may be preventing access.",
  },
  {
    pattern: /\bvpn\b|network|wi-?fi|internet|connectivity/i,
    requestType: "Incident",
    affectedService: "Network access",
    category: "Network",
    subcategory: "VPN or connectivity",
    suggestedAssignmentGroup: "Network Support",
    hypothesis:
      "A local connectivity, VPN client, or authentication issue may be involved.",
  },
  {
    pattern: /outlook|microsoft 365|office 365|e-?mail|mailbox|teams/i,
    requestType: "Incident",
    affectedService: "Microsoft 365",
    category: "Microsoft 365",
    subcategory: "Email or collaboration",
    suggestedAssignmentGroup: "Messaging Support",
    hypothesis:
      "A client, service, or account configuration issue may be involved.",
  },
  {
    pattern: /printer|printing|print queue|spooler/i,
    requestType: "Incident",
    affectedService: "Printing",
    category: "Printing",
    subcategory: "Printer or queue",
    suggestedAssignmentGroup: "End User Computing",
    hypothesis: "A printer, queue, driver, or spooler issue may be involved.",
  },
  {
    pattern:
      /workstation|laptop|desktop|slow|performance|disk|storage|drive full/i,
    requestType: "Incident",
    affectedService: "Workstation",
    category: "Workstation",
    subcategory: "Storage or performance",
    suggestedAssignmentGroup: "End User Computing",
    hypothesis:
      "Endpoint resource pressure or a local configuration issue may be involved.",
  },
  {
    pattern: /\berp\b|business application|sap\b|oracle\b/i,
    requestType: "Incident",
    affectedService: "Business application",
    category: "Business application",
    subcategory: "ERP",
    suggestedAssignmentGroup: "Business Applications",
    hypothesis:
      "An application, entitlement, or upstream service issue may be involved.",
  },
  {
    pattern: /permission|access denied|not authorized|grant access/i,
    requestType: "Access request",
    affectedService: "Access management",
    category: "Identity and access",
    subcategory: "Permissions",
    suggestedAssignmentGroup: "Identity Support",
    hypothesis: "An entitlement or group membership may need review.",
  },
  {
    pattern: /software|application|program|app\b|install|crash|not responding/i,
    requestType: "Incident",
    affectedService: "Software",
    category: "Software",
    subcategory: "General software",
    suggestedAssignmentGroup: "Service Desk",
    hypothesis: "A software configuration or runtime issue may be involved.",
  },
];
const has = (text: string, pattern: RegExp) => pattern.test(text);
export const deterministicIntakeProvider: IntakeProvider = {
  generate(description, requesterName): IntakeDraft {
    const profile = profiles.find((item) => item.pattern.test(description)) ?? {
      requestType: "Incident" as const,
      affectedService: "Unknown service",
      category: "Other" as const,
      subcategory: "Manual triage",
      suggestedAssignmentGroup: "Service Desk" as const,
      hypothesis:
        "The available description is insufficient to suggest a specific cause.",
    };
    const impact = has(
      description,
      /all users|everyone|companywide|company-wide|site down|outage/i,
    )
      ? "High"
      : has(
            description,
            /several|multiple|team|department|\b(?:two|three|four|five|six|seven|eight|nine|[2-9]|\d{2,}) users?\b/i,
          )
        ? "Medium"
        : "Low";
    const urgency = has(
      description,
      /critical|urgent|cannot work|blocked|production down/i,
    )
      ? "High"
      : has(description, /today|soon|intermittent|degraded/i)
        ? "Medium"
        : "Low";
    const questions: string[] = [];
    const required: string[] = [];
    const ask = (missing: boolean, field: string, question: string) => {
      if (missing) {
        required.push(field);
        questions.push(question);
      }
    };
    ask(
      !has(description, /error|message|code|says|shows/i),
      "Exact error message",
      "What is the exact error message or code?",
    );
    ask(
      !has(
        description,
        /user|people|everyone|only me|my account|team|department/i,
      ),
      "Number of affected users",
      "How many users are affected?",
    );
    ask(
      !has(
        description,
        /since|started|ago|today|yesterday|morning|afternoon|\d{1,2}:\d{2}/i,
      ),
      "Start time",
      "When did the problem start?",
    );
    if (profile.category === "Network")
      ask(
        !has(description, /internet|web|browser/i),
        "Internet connectivity",
        "Does general internet access work?",
      );
    if (profile.subcategory === "Account access")
      ask(
        !has(description, /password.*chang|chang.*password/i),
        "Recent password change",
        "Was the password changed recently?",
      );
    ask(
      profile.affectedService === "Unknown service",
      "Affected service or device",
      "Which device, application, or service is affected?",
    );
    ask(
      !has(description, /tried|attempted|restarted|rebooted|cleared|tested/i),
      "Troubleshooting attempted",
      "What troubleshooting has already been attempted?",
    );
    const summary =
      description
        .trim()
        .split(/[.!?\n]/)[0]
        .trim()
        .slice(0, 200) || "Reported IT problem";
    const draft: IntakeDraft = {
      summary,
      description: description.trim(),
      requestType: profile.requestType,
      affectedService: profile.affectedService,
      category: profile.category,
      subcategory: profile.subcategory,
      symptoms: [summary],
      impact,
      urgency,
      calculatedPriority: priority(
        impact,
        urgency,
      ) as IntakeDraft["calculatedPriority"],
      requesterName: requesterName.trim(),
      requiredInformation: required,
      followUpQuestions: questions,
      suspectedCauses: [{ hypothesis: profile.hypothesis, confirmed: false }],
      suggestedAssignmentGroup: profile.suggestedAssignmentGroup,
      suggestionMethod: "Deterministic signal matching",
    };
    return draft;
  },
};
export function generateIntake(
  description: string,
  requesterName: string,
  provider: IntakeProvider = deterministicIntakeProvider,
): IntakeDraft {
  const result = provider.generate(description, requesterName);
  if (!validateIntakeDraft(result))
    throw new Error("Invalid intake provider output");
  result.calculatedPriority = priority(
    result.impact,
    result.urgency,
  ) as IntakeDraft["calculatedPriority"];
  return result;
}
