import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Ticket, Detail, Level } from "../shared/types";
import "./style.css";
async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api" + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error((data as { error?: string }).error || "Request failed");
  return data as T;
}
function App() {
  const [tickets, setTickets] = useState<Ticket[]>([]),
    [selected, setSelected] = useState("INC-1042"),
    [detail, setDetail] = useState<Detail | null>(null);
  const [draft, setDraft] = useState<Ticket | null>(null),
    [tab, setTab] = useState("Analysis"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [note, setNote] = useState(""),
    [status, setStatus] = useState("In progress"),
    [restored, setRestored] = useState(false);
  const [query, setQuery] = useState("");
  async function load(id: string) {
    const [list, record] = await Promise.all([
      api<Ticket[]>("/tickets"),
      api<Detail>("/tickets/" + id),
    ]);
    setTickets(list);
    setDetail(record);
    setDraft(record.ticket);
  }
  useEffect(() => {
    let active = true;
    setDetail(null);
    setDraft(null);
    setNote("");
    setRestored(false);
    setStatus("In progress");
    setError("");
    setNotice("");
    Promise.all([
      api<Ticket[]>("/tickets"),
      api<Detail>("/tickets/" + selected),
    ])
      .then(([list, record]) => {
        if (active) {
          setTickets(list);
          setDetail(record);
          setDraft(record.ticket);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [selected]);
  const current = detail?.ticket.id === selected ? detail.ticket : undefined;
  const dirty =
    !!draft &&
    !!current &&
    ["title", "description", "impact", "urgency"].some(
      (k) => draft[k as keyof Ticket] !== current[k as keyof Ticket],
    );
  const analysis = dirty ? null : current?.analysis;
  async function act(
    path: string,
    body: Record<string, unknown>,
    message: string,
    method = "POST",
  ) {
    if (!current) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/tickets/" + selected + path, method, {
        ...body,
        version: current.version,
      });
      await load(selected);
      setNotice(message);
      if (path === "/handover") {
        setNote("");
        setRestored(false);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const open = tickets.filter((t) => t.status !== "Resolved").length;
  return (
    <div className="app">
      <aside className="rail">
        <div className="brand">
          <span className="logo">
            sd<span>+</span>
          </span>
          <div>
            Service desk<small>INCIDENT WORKSPACE</small>
          </div>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <div className="nav-active">
          <span>▦</span> Incident queue <b>{tickets.length}</b>
        </div>
        <div className="rail-note">
          <span className="live-dot" />
          Personal support lab
          <p>
            Synthetic incidents.
            <br />
            Human decisions.
          </p>
        </div>
        <div className="avatar">
          <span>LT</span>
          <div>
            Lab technician<small>Local workspace</small>
          </div>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <span className="eyebrow">OPERATIONS / SERVICE DESK</span>
            <h1>A clearer path to resolution.</h1>
            <p>Investigate the evidence. Review the next step. Keep control.</p>
          </div>
          <span className="lab-tag">
            <i /> Synthetic data
          </span>
        </header>
        <section className="stats" aria-label="Queue summary">
          <div>
            <small>IN YOUR QUEUE</small>
            <strong>{tickets.length.toString().padStart(2, "0")}</strong>
            <span>Authored lab incidents</span>
          </div>
          <div>
            <small>AWAITING RESOLUTION</small>
            <strong>{open.toString().padStart(2, "0")}</strong>
            <span>Open or under review</span>
          </div>
          <div>
            <small>WORKFLOW</small>
            <strong className="word">Human-led</strong>
            <span>Every action is simulated</span>
          </div>
        </section>
        {error && (
          <div className="alert error" role="alert">
            {error}{" "}
            <button
              onClick={() =>
                load(selected)
                  .then(() => setError(""))
                  .catch((e) => setError(e.message))
              }
            >
              Reload ticket
            </button>
          </div>
        )}
        {notice && (
          <div className="alert success" role="status">
            {notice}
          </div>
        )}
        <div className="workspace">
          <section className="queue">
            <div className="section-top">
              <h2>Incident queue</h2>
              <span>{tickets.length}</span>
            </div>
            <label className="search">
              <span className="sr-only">Search incidents</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search incident or requester…"
              />
            </label>
            <div className="ticket-list">
              {tickets
                .filter((t) =>
                  (t.id + t.title + t.requester)
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .map((t) => (
                  <button
                    disabled={busy}
                    key={t.id}
                    className={
                      "ticket " + (selected === t.id ? "selected" : "")
                    }
                    onClick={() => setSelected(t.id)}
                  >
                    <div>
                      <span>{t.id}</span>
                      <i className={t.status === "Resolved" ? "done" : ""}>
                        {t.status}
                      </i>
                    </div>
                    <h3>{t.title}</h3>
                    <p>
                      {t.requester}
                      <span>→</span>
                    </p>
                  </button>
                ))}
              {tickets.length > 0 &&
                !tickets.some((t) =>
                  (t.id + t.title + t.requester)
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                ) && <p className="empty">No incidents match.</p>}
            </div>
          </section>
          <section className="case">
            {!draft || !current ? (
              <div className="empty">
                {" "}
                {error ? "Workspace unavailable." : "Loading your workspace…"}
              </div>
            ) : (
              <>
                <div className="case-heading">
                  <div>
                    <span className="eyebrow">
                      {current.id} <span className="separator">/</span>{" "}
                      {current.requester}
                    </span>
                    <h2>{current.title}</h2>
                  </div>
                  <span className="status">{current.status}</span>
                </div>
                <details className="details" open>
                  <summary>
                    Incident details <span>Review scope before analysis</span>
                  </summary>
                  <div className="fields">
                    <label>
                      Subject
                      <input
                        disabled={busy}
                        value={draft.title}
                        maxLength={200}
                        onChange={(e) =>
                          setDraft({ ...draft, title: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Description
                      <textarea
                        disabled={busy}
                        value={draft.description}
                        maxLength={5000}
                        rows={3}
                        onChange={(e) =>
                          setDraft({ ...draft, description: e.target.value })
                        }
                      />
                    </label>
                    <div className="scope">
                      {(["impact", "urgency"] as const).map((k) => (
                        <label key={k}>
                          {k === "impact" ? "Business impact" : "Urgency"}
                          <select
                            disabled={busy}
                            value={draft[k]}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                [k]: e.target.value as Level,
                              })
                            }
                          >
                            {["Low", "Medium", "High"].map((v) => (
                              <option key={v}>{v}</option>
                            ))}
                          </select>
                        </label>
                      ))}
                      <button
                        className={dirty ? "primary" : "secondary"}
                        disabled={
                          !dirty ||
                          busy ||
                          !draft.description.trim() ||
                          !draft.title.trim()
                        }
                        onClick={() =>
                          act(
                            "",
                            {
                              title: draft.title,
                              description: draft.description,
                              impact: draft.impact,
                              urgency: draft.urgency,
                            },
                            "Details saved. Previous analysis and approval cleared.",
                            "PATCH",
                          )
                        }
                      >
                        Save details
                      </button>
                    </div>
                    {dirty && (
                      <p className="warning">
                        Unsaved changes. Save details to prepare a new analysis.
                      </p>
                    )}
                  </div>
                </details>
                <div className="analysis-bar">
                  <div>
                    <span className="live-dot" />
                    <b>Runbook guidance</b>
                    <small>Deterministic matching · no LLM</small>
                  </div>
                  <button
                    className="primary"
                    disabled={busy || dirty || current.status === "Resolved"}
                    onClick={() =>
                      act(
                        "/analyze",
                        {},
                        "Analysis prepared. Review evidence before deciding.",
                      )
                    }
                  >
                    {busy
                      ? "Working…"
                      : analysis
                        ? "Reanalyze ticket"
                        : "Analyze ticket"}{" "}
                    <span>↗</span>
                  </button>
                </div>
                <nav className="tabs" aria-label="Incident sections">
                  {["Analysis", "Knowledge", "Automation", "Handover"].map(
                    (t, i) => (
                      <button
                        key={t}
                        aria-current={tab === t ? "page" : undefined}
                        onClick={() => setTab(t)}
                      >
                        <small>0{i + 1}</small>
                        {t}
                      </button>
                    ),
                  )}
                </nav>
                <div className="tab-body">
                  {!analysis ? (
                    <div className="empty">
                      <span className="empty-icon">⌕</span>
                      <h3>Start with the evidence.</h3>
                      <p>
                        {dirty
                          ? "Save your changes, then analyze the updated incident."
                          : "Analyze this incident to find a runbook and build a reviewed support plan."}
                      </p>
                    </div>
                  ) : (
                    <>
                      {tab === "Analysis" && (
                        <>
                          <div className="metrics">
                            <div>
                              <small>RECOMMENDED PRIORITY</small>
                              <strong
                                className={"priority " + analysis.priority}
                              >
                                {analysis.priority}
                              </strong>
                              <span>Impact × urgency policy</span>
                            </div>
                            <div>
                              <small>RUNBOOK MATCH</small>
                              <strong>{analysis.category}</strong>
                              <span>Rule-based, not a diagnosis</span>
                            </div>
                          </div>
                          <section className="hypothesis">
                            <span className="eyebrow">PROPOSED DIAGNOSIS</span>
                            <h3>A working hypothesis</h3>
                            <p>{analysis.hypothesis}</p>
                          </section>
                          <div
                            className={
                              "routing " +
                              (analysis.escalation ? "escalate" : "")
                            }
                          >
                            <b>
                              {analysis.escalation
                                ? "Specialist review recommended"
                                : "Service desk investigation"}
                            </b>
                            <p>{analysis.reason}</p>
                          </div>
                          <h3 className="subheading">Investigation steps</h3>
                          <ol className="steps">
                            {analysis.steps.map((s, i) => (
                              <li key={s}>
                                <span>{String(i + 1).padStart(2, "0")}</span>
                                <p>{s}</p>
                              </li>
                            ))}
                          </ol>
                        </>
                      )}
                      {tab === "Knowledge" && (
                        <>
                          <span className="eyebrow">VERSIONED RUNBOOKS</span>
                          <h3>Evidence you can inspect.</h3>
                          <p className="muted">
                            The authored article used to prepare this
                            investigation. Validate each step in your lab.
                          </p>
                          {analysis.evidence.map((a) => (
                            <article className="evidence" key={a.path}>
                              <h3>{a.title}</h3>
                              <small>{a.path}</small>
                              <pre>{a.content}</pre>
                            </article>
                          ))}
                        </>
                      )}
                      {tab === "Automation" && (
                        <>
                          <span className="pill">SIMULATION ONLY</span>
                          <h3>Review before recording a decision.</h3>
                          {analysis.action ? (
                            <>
                              <div className="hypothesis">
                                <h3>{analysis.action.title}</h3>
                                <p>{analysis.action.risk}</p>
                              </div>
                              <p>
                                No commands run and no accounts, services or
                                network settings change.
                              </p>
                              <div className="actions">
                                <button
                                  className="primary"
                                  disabled={
                                    busy ||
                                    !!current.decision ||
                                    current.status === "Resolved"
                                  }
                                  onClick={() =>
                                    act(
                                      "/decision",
                                      {
                                        analysisId: current.analysis_id,
                                        decision: "approved",
                                      },
                                      "Simulation approval recorded. No action was executed.",
                                    )
                                  }
                                >
                                  Approve simulation
                                </button>
                                <button
                                  className="secondary"
                                  disabled={
                                    busy ||
                                    !!current.decision ||
                                    current.status === "Resolved"
                                  }
                                  onClick={() =>
                                    act(
                                      "/decision",
                                      {
                                        analysisId: current.analysis_id,
                                        decision: "rejected",
                                      },
                                      "Action rejected. No action was executed.",
                                    )
                                  }
                                >
                                  Reject action
                                </button>
                              </div>
                              {current.decision && (
                                <div className="alert success">
                                  Decision recorded: {current.decision}. No
                                  action was executed.
                                </div>
                              )}
                            </>
                          ) : (
                            <p>
                              Manual assessment is required. No automation is
                              proposed.
                            </p>
                          )}
                        </>
                      )}
                      {tab === "Handover" && (
                        <>
                          <span className="eyebrow">
                            REVIEWED COMMUNICATION
                          </span>
                          <h3>Keep the next person informed.</h3>
                          <div className="response">
                            <small>RESPONSE DRAFT · NOTHING IS SENT</small>
                            <p>{analysis.response}</p>
                          </div>
                          <label>
                            Next status
                            <select
                              value={status}
                              onChange={(e) => {
                                setStatus(e.target.value);
                                setRestored(false);
                              }}
                            >
                              <option>In progress</option>
                              <option>Escalated</option>
                              <option>Resolved</option>
                            </select>
                          </label>
                          <label>
                            Technician evidence / handover note
                            <textarea
                              value={note}
                              maxLength={5000}
                              rows={4}
                              onChange={(e) => setNote(e.target.value)}
                              placeholder="Record synthetic lab observations and remaining questions."
                            />
                          </label>
                          {status === "Resolved" && (
                            <label className="check">
                              <input
                                type="checkbox"
                                checked={restored}
                                onChange={(e) => setRestored(e.target.checked)}
                              />
                              The user confirmed service restoration
                            </label>
                          )}
                          <button
                            className="primary"
                            disabled={
                              busy ||
                              !note.trim() ||
                              (status === "Resolved" && !restored)
                            }
                            onClick={() =>
                              act(
                                "/handover",
                                {
                                  status,
                                  note,
                                  restored,
                                  analysisId: current.analysis_id,
                                },
                                "Handover saved to the incident history.",
                              )
                            }
                          >
                            Save handover
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
                <details className="history">
                  <summary>
                    Incident history{" "}
                    <span>{detail?.audit.length ?? 0} recent events</span>
                  </summary>
                  {detail?.audit.length ? (
                    detail.audit.map((a) => (
                      <div key={a.id}>
                        <span className="history-dot" />
                        <p>
                          <b>{a.kind}</b> {a.detail}
                          <small>
                            {new Date(a.created_at).toLocaleString()} ·{" "}
                            {a.actor}
                          </small>
                        </p>
                      </div>
                    ))
                  ) : (
                    <p>No recorded events yet.</p>
                  )}
                </details>
              </>
            )}
          </section>
        </div>
        <footer>
          Service Desk Copilot{" "}
          <span>
            Personal portfolio lab · Synthetic data · Simulated automation
          </span>
        </footer>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
