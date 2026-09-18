import { authorize, isLocalDevelopment, type AuthConfig } from "./auth";
import { analyze } from "./analysis";
import { generateIntake } from "./intake";
import { validateIntakeDraft, type IntakeDraft } from "../shared/intake";
import { InvalidPage, pageState, pageResult } from "./pagination";
import type { Audit, Ticket } from "../shared/types";
import { validateRetrievalQuery } from "../shared/knowledge";
import { D1FtsRetriever } from "./retrieval";
import { digest, feedbackSummary, recordFeedback } from "./feedback";
import { logSafeEvent } from "./observability";
import { capacity, createExport, InvalidOperation } from "./operations";
import {
  feedbackOutcomes,
  helpfulReasons,
  notHelpfulReasons,
} from "../shared/feedback";
interface Env extends AuthConfig {
  DB: D1Database;
  ASSETS: Fetcher;
}
type Row = Omit<Ticket, "analysis" | "structuredIntake"> & {
  analysis: string | null;
  structured_intake?: string | null;
};
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
const ticket = (row: Row): Ticket => {
  const { structured_intake, ...fields } = row;
  return {
    ...fields,
    analysis: row.analysis ? JSON.parse(row.analysis) : null,
    structuredIntake: structured_intake ? JSON.parse(structured_intake) : null,
  };
};
const validText = (x: unknown, max = 5000): x is string =>
  typeof x === "string" && !!x.trim() && x.length <= max;
const parseBody = async (request: Request) => {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > 16384)
    return { error: json({ error: "Request too large" }, 413) };
  const reader = request.body?.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  if (reader)
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16384) {
        await reader.cancel();
        return { error: json({ error: "Request too large" }, 413) };
      }
      chunks.push(value);
    }
  try {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const body: unknown = JSON.parse(raw);
    if (!body || Array.isArray(body) || typeof body !== "object") throw Error();
    return { body: body as Record<string, unknown> };
  } catch {
    return { error: json({ error: "Invalid JSON" }, 400) };
  }
};
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const requestId = crypto.randomUUID(),
      started = Date.now();
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
        const retrievalRead =
          url.pathname === "/api/knowledge/retrieve" &&
          request.method === "POST";
        if (!retrievalRead && !identity.permissions.includes("write"))
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
      if (
        ["/api/tickets", "/api/tickets/page"].includes(url.pathname) &&
        request.method === "GET"
      ) {
        const state = await pageState(
          env.DB,
          url,
          actor,
          "tickets",
          "SELECT COALESCE(MAX(rowid),0) high FROM tickets",
        );
        const rows = await env.DB.prepare(
          "SELECT * FROM tickets WHERE rowid<=? AND id>? ORDER BY id LIMIT ?",
        )
          .bind(state.high, state.last, state.limit + 1)
          .all<Row>();
        const page = await pageResult(
          state,
          rows.results.map(ticket),
          (row) => row.id,
        );
        if (url.pathname.endsWith("/page")) return json(page);
        const response = json(page.items);
        if (page.nextCursor)
          response.headers.set("X-Next-Cursor", page.nextCursor);
        return response;
      }
      if (
        url.pathname === "/api/knowledge/retrieve" &&
        request.method === "POST"
      ) {
        const parsed = await parseBody(request);
        if (parsed.error) return parsed.error;
        if (!validateRetrievalQuery(parsed.body))
          return json(
            { error: "The retrieval query or filters are invalid." },
            400,
          );
        const context = parsed.body.context as
          import("../shared/feedback").RetrievalContext | undefined;
        if (context?.incidentId) {
          const current = await env.DB.prepare(
            "SELECT version,analysis_id FROM tickets WHERE id=?",
          )
            .bind(context.incidentId)
            .first<{ version: number; analysis_id: string | null }>();
          if (
            !current ||
            current.version !== context.incidentVersion ||
            (context.analysisContextId !== undefined &&
              current.analysis_id !== context.analysisContextId)
          )
            return json({ error: "The retrieval context is invalid." }, 400);
        }
        const results = await new D1FtsRetriever(env.DB).retrieve(parsed.body);
        const retrievalId = crypto.randomUUID(),
          actorHash = await digest(actor);
        const filterCount = Object.keys(parsed.body.filters ?? {}).length;
        await env.DB.batch([
          env.DB.prepare(
            "INSERT INTO knowledge_retrieval_events(retrieval_id,actor_hash,incident_id,incident_version,analysis_context_id,retrieval_mode,result_count,filter_count,abstained) VALUES(?,?,?,?,?,'lexical',?,?,?)",
          ).bind(
            retrievalId,
            actorHash,
            context?.incidentId ?? null,
            context?.incidentVersion ?? null,
            context?.analysisContextId ?? null,
            results.length,
            filterCount,
            results.length === 0 ? 1 : 0,
          ),
          ...results.map((r) =>
            env.DB.prepare(
              "INSERT INTO knowledge_retrieval_items(retrieval_id,document_id,chunk_id) VALUES(?,?,?)",
            ).bind(retrievalId, r.documentId, r.chunkId),
          ),
        ]);
        logSafeEvent({
          requestId,
          route: url.pathname,
          status: 200,
          durationMs: Date.now() - started,
          resultCount: results.length,
          abstention: results.length === 0,
          filterCount,
        });
        return json({
          results,
          retrievalId,
          abstained: results.length === 0,
          method: "D1 FTS5 lexical retrieval",
        });
      }
      if (
        url.pathname === "/api/knowledge/feedback" &&
        request.method === "POST"
      ) {
        const parsed = await parseBody(request);
        if (parsed.error) return parsed.error;
        const result = await recordFeedback(env.DB, actor, parsed.body);
        const safeOutcome = feedbackOutcomes.find(
          (x) => x === parsed.body?.outcome,
        );
        const safeReason = [...helpfulReasons, ...notHelpfulReasons].find(
          (x) => x === parsed.body?.reason,
        );
        logSafeEvent({
          requestId,
          route: url.pathname,
          status: result.status,
          durationMs: Date.now() - started,
          ...(safeOutcome ? { outcome: safeOutcome } : {}),
          ...(safeReason ? { reason: safeReason } : {}),
        });
        return "receipt" in result
          ? json(result.receipt, result.status)
          : json({ error: result.error }, result.status);
      }
      if (
        url.pathname === "/api/knowledge/feedback/summary" &&
        request.method === "GET"
      ) {
        if (!identity.permissions.includes("write"))
          return json({ error: "Write permission required" }, 403);
        if (url.search)
          return json({ error: "Query parameters are not supported." }, 400);
        const summary = await feedbackSummary(env.DB);
        logSafeEvent({
          requestId,
          route: url.pathname,
          status: 200,
          durationMs: Date.now() - started,
        });
        return json(summary);
      }
      if (
        url.pathname === "/api/operations/export" &&
        request.method === "POST"
      ) {
        if (!identity.permissions.includes("write"))
          return json({ error: "Write permission required" }, 403);
        const parsed = await parseBody(request);
        if (parsed.error) return parsed.error;
        try {
          const result = await createExport(env.DB, parsed.body),
            response = json(result.payload);
          response.headers.set("X-Artifact-SHA256", result.artifactSha256);
          response.headers.set(
            "Content-Type",
            "application/vnd.deskpilot.export+json; version=1",
          );
          response.headers.set(
            "Content-Disposition",
            `attachment; filename="deskpilot-${result.payload.dataset}-v1.json"`,
          );
          logSafeEvent({
            requestId,
            route: url.pathname,
            status: 200,
            durationMs: Date.now() - started,
            dataset: result.payload.dataset,
            records: result.payload.recordCount,
            bytes: new TextEncoder().encode(result.canonical).byteLength,
          });
          return response;
        } catch (error) {
          if (error instanceof InvalidOperation)
            return json({ error: "Invalid export request." }, 400);
          throw error;
        }
      }
      if (
        url.pathname === "/api/operations/capacity" &&
        request.method === "POST"
      ) {
        if (!identity.permissions.includes("write"))
          return json({ error: "Write permission required" }, 403);
        const parsed = await parseBody(request);
        if (parsed.error) return parsed.error;
        if (Object.keys(parsed.body).length)
          return json({ error: "Invalid capacity request." }, 400);
        return json(await capacity(env.DB));
      }
      if (url.pathname === "/api/intake/draft" && request.method === "POST") {
        const parsed = await parseBody(request);
        if (parsed.error) return parsed.error;
        if (
          !validText(parsed.body?.description, 5000) ||
          !validText(parsed.body?.requesterName, 120)
        )
          return json(
            { error: "A problem description and requester name are required." },
            400,
          );
        return json(
          generateIntake(parsed.body.description, parsed.body.requesterName),
        );
      }
      if (
        url.pathname === "/api/intake/validate" &&
        request.method === "POST"
      ) {
        const parsed = await parseBody(request);
        if (parsed.error) return parsed.error;
        if (!validateIntakeDraft(parsed.body?.draft))
          return json(
            { error: "The reviewed intake draft is malformed or unsupported." },
            400,
          );
        const draft = generateIntake(
          parsed.body.draft.description,
          parsed.body.draft.requesterName,
          { generate: () => parsed.body!.draft },
        );
        return json({ draft, valid: true });
      }
      if (
        url.pathname === "/api/intake/incidents" &&
        request.method === "POST"
      ) {
        const parsed = await parseBody(request);
        if (parsed.error) return parsed.error;
        if (
          parsed.body?.confirmed !== true ||
          !validateIntakeDraft(parsed.body?.draft)
        )
          return json(
            {
              error:
                "A valid reviewed draft and explicit confirmation are required.",
            },
            400,
          );
        const draft = generateIntake(
          parsed.body.draft.description,
          parsed.body.draft.requesterName,
          { generate: () => parsed.body!.draft },
        ) as IntakeDraft;
        for (let attempt = 0; attempt < 5; attempt++) {
          const id = `INC-${Date.now()}${crypto.getRandomValues(new Uint32Array(1))[0].toString().padStart(10, "0")}`;
          const results = await env.DB.batch([
            env.DB.prepare(
              "INSERT OR IGNORE INTO tickets(id,title,description,requester,impact,urgency,status,version,origin,structured_intake) VALUES(?,?,?,?,?,?,'Open',1,'structured-intake',?)",
            ).bind(
              id,
              draft.summary,
              draft.description,
              draft.requesterName,
              draft.impact,
              draft.urgency,
              JSON.stringify(draft),
            ),
            env.DB.prepare(
              "INSERT INTO audit(ticket_id,kind,actor,detail) SELECT ?,'created',?,'Incident created after explicit confirmation through deterministic structured intake.' WHERE changes()=1",
            ).bind(id, actor),
          ]);
          if (results[0].meta.changes === 1)
            return json({ id, version: 1 }, 201);
        }
        return json(
          {
            error:
              "Could not allocate a unique incident identifier. Retry safely.",
          },
          409,
        );
      }
      const match = url.pathname.match(
        /^\/api\/tickets\/(INC-\d+)(?:\/(analyze|decision|handover|audit|analyses))?$/,
      );
      if (!match) return json({ error: "Not found" }, 404);
      const [, id, operation] = match;
      const row = await env.DB.prepare("SELECT * FROM tickets WHERE id=?")
        .bind(id)
        .first<Row>();
      if (!row) return json({ error: "Ticket not found" }, 404);
      if (
        request.method === "GET" &&
        (!operation || operation === "audit" || operation === "analyses")
      ) {
        if (!operation && url.search) throw new InvalidPage();
        const history = operation === "analyses";
        const table = history ? "analysis_history" : "audit";
        const state = await pageState(
          env.DB,
          url,
          actor,
          `${id}/${history ? "analyses" : "audit"}`,
          `SELECT COALESCE(MAX(id),0) high FROM ${table} WHERE ticket_id=?`,
          [id],
        );
        const rows = await env.DB.prepare(
          `SELECT * FROM ${table} WHERE ticket_id=? AND id<=? AND id<? ORDER BY id DESC LIMIT ?`,
        )
          .bind(id, state.high, state.last, state.limit + 1)
          .all<Audit & { analysis_json: string; evidence_json: string }>();
        const page = await pageResult(state, rows.results, (row) => row.id);
        if (history)
          return json({
            ...page,
            items: page.items.map(
              ({ analysis_json, evidence_json, ...fields }) => ({
                ...fields,
                analysis: JSON.parse(analysis_json),
                evidence: JSON.parse(evidence_json),
              }),
            ),
          });
        if (operation === "audit") return json(page);
        return json({
          ticket: ticket(row),
          audit: page.items,
          auditNextCursor: page.nextCursor,
        });
      }
      if (
        request.method === "GET" ||
        operation === "audit" ||
        operation === "analyses"
      )
        return json({ error: "Method not allowed" }, 405);
      const parsed = await parseBody(request);
      if (parsed.error) return parsed.error;
      const body = parsed.body!;
      if (!Number.isInteger(body.version) || body.version !== row.version)
        return json(
          { error: "This ticket changed. Reload before continuing." },
          409,
        );
      let statement: D1PreparedStatement;
      let snapshot: D1PreparedStatement | undefined;
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
        snapshot = env.DB.prepare(
          "INSERT INTO analysis_history(analysis_id,ticket_id,incident_version,actor,analysis_json,evidence_json) SELECT ?,?,?,?,?,? WHERE changes()=1",
        ).bind(
          analysisId,
          id,
          row.version + 1,
          actor,
          JSON.stringify(result),
          JSON.stringify(result.evidence),
        );
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
        ...(snapshot ? [snapshot] : []),
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
    } catch (error) {
      if (error instanceof InvalidPage)
        return json({ error: "Invalid pagination request." }, 400);
      logSafeEvent({
        requestId,
        route: url.pathname,
        status: 500,
        durationMs: Date.now() - started,
      });
      return json(
        {
          error: "The request could not be completed. Retry safely.",
        },
        500,
      );
    }
  },
};
