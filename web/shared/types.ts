export type Level = "Low" | "Medium" | "High";
export type Ticket = {
  id: string;
  title: string;
  description: string;
  requester: string;
  impact: Level;
  urgency: Level;
  status: string;
  version: number;
  analysis: Analysis | null;
  analysis_id: string | null;
  decision: string | null;
  origin?: "existing" | "structured-intake";
  structuredIntake?: import("./intake").IntakeDraft | null;
};
export type Analysis = {
  mode: string;
  category: string;
  priority: string;
  hypothesis: string;
  steps: string[];
  evidence: { title: string; path: string; content: string }[];
  action: { id: string; title: string; risk: string } | null;
  escalation: boolean;
  reason: string;
  response: string;
};
export type Audit = {
  id: number;
  kind: string;
  actor: string;
  detail: string;
  created_at: string;
};
export type Page<T> = { items: T[]; nextCursor: string | null };
export type AnalysisSnapshot = {
  id: number;
  analysis_id: string;
  ticket_id: string;
  incident_version: number;
  schema_version: number;
  actor: string;
  created_at: string;
  analysis: Analysis;
  evidence: Analysis["evidence"];
};
export type Detail = {
  ticket: Ticket;
  audit: Audit[];
  auditNextCursor?: string | null;
};
