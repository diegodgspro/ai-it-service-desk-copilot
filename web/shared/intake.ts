import type { Level } from "./types";

export const requestTypes = ["Incident", "Access request"] as const;
export const intakeCategories = [
  "Identity and access",
  "Network",
  "Microsoft 365",
  "Printing",
  "Workstation",
  "Business application",
  "Software",
  "Other",
] as const;
export const assignmentGroups = [
  "Service Desk",
  "Identity Support",
  "Network Support",
  "Messaging Support",
  "End User Computing",
  "Business Applications",
] as const;
export type Priority = "P1" | "P2" | "P3" | "P4";
export type IntakeDraft = {
  summary: string;
  description: string;
  requestType: (typeof requestTypes)[number];
  affectedService: string;
  category: (typeof intakeCategories)[number];
  subcategory: string;
  symptoms: string[];
  impact: Level;
  urgency: Level;
  calculatedPriority: Priority;
  requesterName: string;
  assetIdentifier?: string;
  location?: string;
  requiredInformation: string[];
  followUpQuestions: string[];
  suspectedCauses: { hypothesis: string; confirmed: false }[];
  suggestedAssignmentGroup: (typeof assignmentGroups)[number];
  suggestionMethod: "Deterministic signal matching";
};

const levels: Level[] = ["Low", "Medium", "High"];
const priorities: Priority[] = ["P1", "P2", "P3", "P4"];
const clean = (value: unknown, max: number) =>
  typeof value === "string" && !!value.trim() && value.length <= max;
const stringList = (value: unknown, maxItems = 8) =>
  Array.isArray(value) &&
  value.length <= maxItems &&
  value.every((x) => clean(x, 300));

export function validateIntakeDraft(value: unknown): value is IntakeDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const x = value as Record<string, unknown>;
  const allowed = new Set([
    "summary",
    "description",
    "requestType",
    "affectedService",
    "category",
    "subcategory",
    "symptoms",
    "impact",
    "urgency",
    "calculatedPriority",
    "requesterName",
    "assetIdentifier",
    "location",
    "requiredInformation",
    "followUpQuestions",
    "suspectedCauses",
    "suggestedAssignmentGroup",
    "suggestionMethod",
  ]);
  if (Object.keys(x).some((key) => !allowed.has(key))) return false;
  return (
    clean(x.summary, 200) &&
    clean(x.description, 5000) &&
    requestTypes.includes(x.requestType as never) &&
    clean(x.affectedService, 120) &&
    intakeCategories.includes(x.category as never) &&
    clean(x.subcategory, 120) &&
    stringList(x.symptoms) &&
    levels.includes(x.impact as Level) &&
    levels.includes(x.urgency as Level) &&
    priorities.includes(x.calculatedPriority as Priority) &&
    clean(x.requesterName, 120) &&
    (x.assetIdentifier === undefined || clean(x.assetIdentifier, 120)) &&
    (x.location === undefined || clean(x.location, 120)) &&
    stringList(x.requiredInformation) &&
    stringList(x.followUpQuestions) &&
    Array.isArray(x.suspectedCauses) &&
    x.suspectedCauses.length <= 5 &&
    x.suspectedCauses.every(
      (cause) =>
        cause &&
        typeof cause === "object" &&
        !Array.isArray(cause) &&
        Object.keys(cause).length === 2 &&
        clean((cause as Record<string, unknown>).hypothesis, 300) &&
        (cause as Record<string, unknown>).confirmed === false,
    ) &&
    assignmentGroups.includes(x.suggestedAssignmentGroup as never) &&
    x.suggestionMethod === "Deterministic signal matching"
  );
}
