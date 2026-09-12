import React, { useState } from "react";
import type { IntakeDraft } from "../shared/intake";
import {
  assignmentGroups,
  intakeCategories,
  requestTypes,
} from "../shared/intake";
import type { Api } from "./api";
import { KnowledgeEvidence } from "./KnowledgeEvidence";

type Props = {
  api: Api;
  requesterName: string;
  onCancel: () => void;
  onCreated: (id: string) => void;
};
const levels = ["Low", "Medium", "High"] as const;
export function Intake({ api, requesterName, onCancel, onCreated }: Props) {
  const [description, setDescription] = useState("");
  const [draft, setDraft] = useState<IntakeDraft | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const update = <K extends keyof IntakeDraft>(key: K, value: IntakeDraft[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  async function generate(text = description) {
    setBusy(true);
    setError("");
    setConfirmed(false);
    try {
      const result = await api<IntakeDraft>("/intake/draft", "POST", {
        description: text,
        requesterName,
      });
      setDraft(result);
      setDescription(text);
      setAnswers({});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function applyAnswers() {
    if (!draft) return;
    const supplied = draft.followUpQuestions
      .map((q, i) => `${q} ${answers[i] || ""}`.trim())
      .filter((x, i) => answers[i]?.trim());
    if (!supplied.length) {
      setError(
        "Answer at least one follow-up question before updating the draft.",
      );
      return;
    }
    await generate(
      `${draft.description}\n\nAdditional information:\n${supplied.join("\n")}`,
    );
  }
  async function create() {
    if (!draft || !confirmed) return;
    setBusy(true);
    setError("");
    try {
      const checked = await api<{ draft: IntakeDraft }>(
        "/intake/validate",
        "POST",
        { draft },
      );
      const result = await api<{ id: string }>("/intake/incidents", "POST", {
        draft: checked.draft,
        confirmed: true,
      });
      onCreated(result.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="intake" aria-labelledby="intake-title">
      <div className="intake-heading">
        <div>
          <span className="eyebrow">STRUCTURED INTAKE</span>
          <h2 id="intake-title">New incident</h2>
          <p>
            Describe the problem, review every suggestion, then confirm
            creation.
          </p>
        </div>
        <button className="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {!draft ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void generate();
          }}
          className="intake-start"
        >
          <label htmlFor="problem-description">Problem description</label>
          <textarea
            id="problem-description"
            rows={8}
            required
            minLength={10}
            maxLength={5000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Example: Since 9:00, three users cannot connect to VPN. Error 812 appears; internet access works and restarting did not help."
          />
          <p className="field-help">
            Do not include passwords, MFA codes, access tokens, or other
            secrets.
          </p>
          <div className="intake-actions">
            <button
              className="primary"
              disabled={busy || description.trim().length < 10}
            >
              {busy ? "Preparing draft…" : "Prepare structured draft"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setDescription("")}
              disabled={busy || !description}
            >
              Reset
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="method-note" role="note">
            <strong>Deterministic suggestion</strong>
            <span>
              Keyword and rule matching prepared this draft. It is not an AI
              diagnosis. Priority is fixed by the impact × urgency policy.
            </span>
          </div>
          <KnowledgeEvidence
            api={api}
            query={`${draft.affectedService} ${draft.category} ${draft.summary} ${draft.symptoms.join(" ")} ${draft.description}`}
            filters={{ language: "en", approvalStatus: "approved" }}
            label="Suggested approved articles"
          />
          {draft.followUpQuestions.length > 0 && (
            <section className="followups" aria-labelledby="followup-title">
              <h3 id="followup-title">Missing information</h3>
              <p>
                Answer relevant questions, then update the draft. You can also
                edit the reviewed fields directly.
              </p>
              {draft.followUpQuestions.map((question, index) => (
                <label key={question}>
                  {question}
                  <input
                    value={answers[index] || ""}
                    onChange={(e) =>
                      setAnswers({ ...answers, [index]: e.target.value })
                    }
                  />
                </label>
              ))}
              <button
                className="secondary"
                onClick={() => void applyAnswers()}
                disabled={busy}
              >
                Update from answers
              </button>
            </section>
          )}
          <section
            className="draft-grid"
            aria-label="Structured incident draft"
          >
            <label className="wide">
              Summary
              <input
                maxLength={200}
                value={draft.summary}
                onChange={(e) => update("summary", e.target.value)}
              />
            </label>
            <label className="wide">
              Description
              <textarea
                rows={6}
                maxLength={5000}
                value={draft.description}
                onChange={(e) => update("description", e.target.value)}
              />
            </label>
            <label>
              Requester name
              <input
                maxLength={120}
                value={draft.requesterName}
                onChange={(e) => update("requesterName", e.target.value)}
              />
            </label>
            <label>
              Request type
              <select
                value={draft.requestType}
                onChange={(e) =>
                  update(
                    "requestType",
                    e.target.value as IntakeDraft["requestType"],
                  )
                }
              >
                {requestTypes.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              Affected service
              <input
                maxLength={120}
                value={draft.affectedService}
                onChange={(e) => update("affectedService", e.target.value)}
              />
            </label>
            <label>
              Category
              <select
                value={draft.category}
                onChange={(e) =>
                  update("category", e.target.value as IntakeDraft["category"])
                }
              >
                {intakeCategories.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              Subcategory
              <input
                maxLength={120}
                value={draft.subcategory}
                onChange={(e) => update("subcategory", e.target.value)}
              />
            </label>
            <label>
              Suggested assignment group
              <select
                value={draft.suggestedAssignmentGroup}
                onChange={(e) =>
                  update(
                    "suggestedAssignmentGroup",
                    e.target.value as IntakeDraft["suggestedAssignmentGroup"],
                  )
                }
              >
                {assignmentGroups.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              Impact
              <select
                value={draft.impact}
                onChange={(e) =>
                  update("impact", e.target.value as IntakeDraft["impact"])
                }
              >
                {levels.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              Urgency
              <select
                value={draft.urgency}
                onChange={(e) =>
                  update("urgency", e.target.value as IntakeDraft["urgency"])
                }
              >
                {levels.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              Calculated priority
              <input
                value={draft.calculatedPriority}
                readOnly
                aria-describedby="priority-help"
              />
              <small id="priority-help">
                Recalculated by the server during validation.
              </small>
            </label>
            <label>
              Device or asset identifier
              <input
                maxLength={120}
                value={draft.assetIdentifier || ""}
                onChange={(e) =>
                  update("assetIdentifier", e.target.value || undefined)
                }
              />
            </label>
            <label>
              Location
              <input
                maxLength={120}
                value={draft.location || ""}
                onChange={(e) =>
                  update("location", e.target.value || undefined)
                }
              />
            </label>
            <label className="wide">
              Symptoms (one per line)
              <textarea
                rows={3}
                value={draft.symptoms.join("\n")}
                onChange={(e) =>
                  update("symptoms", e.target.value.split("\n").filter(Boolean))
                }
              />
            </label>
            <label className="wide">
              Required information (one per line)
              <textarea
                rows={3}
                value={draft.requiredInformation.join("\n")}
                onChange={(e) =>
                  update(
                    "requiredInformation",
                    e.target.value.split("\n").filter(Boolean),
                  )
                }
              />
            </label>
          </section>
          <section className="hypotheses">
            <h3>Unconfirmed hypotheses</h3>
            {draft.suspectedCauses.map((cause) => (
              <p key={cause.hypothesis}>
                <strong>Unconfirmed:</strong> {cause.hypothesis}
              </p>
            ))}
          </section>
          <div className="confirmation">
            <label>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />{" "}
              I reviewed this draft and explicitly confirm creation of the
              incident.
            </label>
            <div className="intake-actions">
              <button
                className="primary"
                disabled={busy || !confirmed}
                onClick={() => void create()}
              >
                {busy ? "Creating incident…" : "Create confirmed incident"}
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => {
                  setDraft(null);
                  setDescription("");
                  setAnswers({});
                  setConfirmed(false);
                  setError("");
                }}
              >
                Reset intake
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
