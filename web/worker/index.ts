import { authorize, isLocalDevelopment, type AuthConfig } from "./auth";
import { analyze } from "./analysis";
import type { Ticket } from "../shared/types";
interface Env extends AuthConfig {
  DB: D1Database;
  ASSETS: Fetcher;
}
type Row = Omit<Ticket, "analysis"> & { analysis: string | null };
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
const ticket = (row: Row): Ticket => ({
  ...row,
  analysis: row.analysis ? JSON.parse(row.analysis) : null,
});
const validText = (x: unknown, max = 5000): x is string =>
  typeof x === "string" && !!x.trim() && x.length <= max;
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/auth/local" && request.method === "GET")
      return json({ enabled: isLocalDevelopment(request, env) });
    // The public SPA shell contains no ticket data and must load before login.
    if (url.pathname !== "/api" && !url.pathname.startsWith("/api/"))
      return env.ASSETS.fetch(request);
    const identity = await authorize(request, env);
    if (!identity)
      return json(
        {
          error:
            "Authentication required. Sign in again or contact the workspace administrator.",
        },
        401,
      );
    const actor = identity.actor;
    if (!identity.permissions.includes("read"))
      return json({ error: "Read permission required" }, 403);

    try {
      if (!["GET", "POST", "PATCH"].includes(request.method))
        return json({ error: "Method not allowed" }, 405);
      if (request.method !== "GET") {
        if (!identity.permissions.includes("write"))
          return json({ error: "Write permission required" }, 403);
        if (request.headers.get("origin") !== url.origin)
          return json({ error: "Same-origin request required" }, 403);
        if (
          request.headers
            .get("content-type")
            ?.split(";")[0]
            .trim()
            .toLowerCase() !== "application/json"
        )
          return json({ error: "JSON required" }, 415);
      }
      if (url.pathname === "/api/tickets" && request.method === "GET") {
        const rows = await env.DB.prepare(
          "SELECT * FROM tickets ORDER BY id LIMIT 100",
        ).all<Row>();
        return json(rows.results.map(ticket));
      }
      const match = url.pathname.match(
        /^\/api\/tickets\/(INC-\d+)(?:\/(analyze|decision|handover))?$/,
      );
      if (!match) return json({ error: "Not found" }, 404);
      const [, id, operation] = match;
      const row = await env.DB.prepare("SELECT * FROM tickets WHERE id=?")
        .bind(id)
        .first<Row>();
      if (!row) return json({ error: "Ticket not found" }, 404);
      if (request.method === "GET" && !operation) {
        const audit = await env.DB.prepare(
          "SELECT * FROM audit WHERE ticket_id=? ORDER BY id DESC LIMIT 100",
        )
          .bind(id)
          .all();
        return json({ ticket: ticket(row), audit: audit.results });
      }
      const raw = await request.text();
      if (raw.length > 16000) return json({ error: "Request too large" }, 413);
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(raw);
        if (!body || Array.isArray(body) || typeof body !== "object")
          throw Error();
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }
      if (!Number.isInteger(body.version) || body.version !== row.version)
        return json(
          { error: "This ticket changed. Reload before continuing." },
          409,
        );
      let statement: D1PreparedStatement;
      let kind: string, detail: string;
      if (request.method === "PATCH" && !operation) {
        if (
          !validText(body.title, 200) ||
          !validText(body.description) ||
          !["Low", "Medium", "High"].includes(String(body.impact)) ||
          !["Low", "Medium", "High"].includes(String(body.urgency))
        )
          return json(
            {
              error:
                "Complete all ticket details using valid impact and urgency.",
            },
            400,
          );
        if (
          body.title === row.title &&
          body.description === row.description &&
          body.impact === row.impact &&
          body.urgency === row.urgency
        )
          return json({ ok: true });
        statement = env.DB.prepare(
          "UPDATE tickets SET title=?,description=?,impact=?,urgency=?,status='Open',version=version+1,analysis=NULL,analysis_id=NULL,decision=NULL WHERE id=? AND version=?",
        ).bind(
          body.title,
          body.description,
          body.impact,
          body.urgency,
          id,
          row.version,
        );
        kind = "updated";
        detail =
          "Ticket details changed. Previous analysis and approval invalidated; ticket reopened.";
      } else if (request.method === "POST" && operation === "analyze") {
        if (row.status === "Resolved")
          return json(
            { error: "Edit and reopen the ticket before reanalysis." },
            409,
          );
        const result = analyze(ticket(row));
        const analysisId = crypto.randomUUID();
        statement = env.DB.prepare(
          "UPDATE tickets SET analysis=?,analysis_id=?,decision=NULL,version=version+1 WHERE id=? AND version=?",
        ).bind(JSON.stringify(result), analysisId, id, row.version);
        kind = "analyzed";
        detail =
          "Runbook analysis " +
          analysisId +
          " prepared; prior decision invalidated.";
      } else if (request.method === "POST" && operation === "decision") {
        const a = ticket(row).analysis;
        if (
          row.status === "Resolved" ||
          !a?.action ||
          !row.analysis_id ||
          body.analysisId !== row.analysis_id ||
          row.decision
        )
          return json(
            {
              error:
                "A current, undecided analysis with a proposed action is required.",
            },
            409,
          );
        if (!["approved", "rejected"].includes(String(body.decision)))
          return json({ error: "Invalid decision" }, 400);
        statement = env.DB.prepare(
          "UPDATE tickets SET decision=?,version=version+1 WHERE id=? AND version=? AND decision IS NULL",
        ).bind(body.decision, id, row.version);
        kind = "simulation";
        detail = `${body.decision === "approved" ? "SIMULATED approval" : "REJECTED"}: ${a.action.title}. No action was executed. Analysis ${row.analysis_id}.`;
      } else if (request.method === "POST" && operation === "handover") {
        if (
          !["In progress", "Escalated", "Resolved"].includes(
            String(body.status),
          ) ||
          !validText(body.note)
        )
          return json(
            { error: "A valid status and technician note are required." },
            400,
          );
        if (!row.analysis_id || body.analysisId !== row.analysis_id)
          return json(
            { error: "Analyze the current ticket before handover." },
            409,
          );
        if (body.status === "Resolved" && body.restored !== true)
          return json(
            { error: "Confirm service restoration before resolution." },
            400,
          );
        statement = env.DB.prepare(
          "UPDATE tickets SET status=?,version=version+1 WHERE id=? AND version=?",
        ).bind(body.status, id, row.version);
        kind = "handover";
        detail = `${body.status}${body.status === "Resolved" ? " â€” service restoration confirmed" : ""}: ${String(body.note).trim()}`;
      } else return json({ error: "Method not allowed" }, 405);
      // D1 batch is transactional. changes() gates the audit insert on the optimistic update.
      const results = await env.DB.batch([
        statement,
        env.DB.prepare(
          "INSERT INTO audit(ticket_id,kind,actor,detail) SELECT ?,?,?,? WHERE changes()=1",
        ).bind(id, kind, actor, detail),
      ]);
      if (results[0].meta.changes !== 1)
        return json(
          { error: "Concurrent update. Reload before continuing." },
          409,
        );
      return json({ ok: true });
    } catch {
      return json(
        {
          error:
            "The request could not be completed. Check local database migrations and retry.",
        },
        500,
      );
    }
  },
};
