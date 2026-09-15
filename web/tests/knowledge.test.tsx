import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KnowledgeEvidence } from "../src/KnowledgeEvidence";
const result = {
  documentId: "kb-hardware-printing",
  chunkId: "kb-hardware-printing--01-symptoms",
  title: "Hardware: Printing",
  heading: "Symptoms",
  excerpt: "Printer offline and documents stuck in the queue.",
  score: 0.75,
  matchedTerms: ["printer", "queue"],
  matchReason: "Matched terms: printer, queue",
  metadata: {
    documentId: "kb-hardware-printing",
    title: "Hardware: Printing",
    sourceType: "runbook" as const,
    service: "Printing",
    category: "Printer",
    product: "Network printer",
    language: "en",
    approvalStatus: "approved" as const,
    version: "1.0",
    lastReviewed: "2026-09-11",
    tags: ["printer"],
    classification: "synthetic-demo" as const,
  },
  citation: {
    documentId: "kb-hardware-printing",
    chunkId: "kb-hardware-printing--01-symptoms",
    label: "kb-hardware-printing@1.0#kb-hardware-printing--01-symptoms",
  },
  documentHash: "a".repeat(64),
};
const emptySummary = {retrievedEvidenceCount:1,evaluatedEvidenceCount:0,feedbackCoveragePercent:0,helpfulPercent:null,reasons:[],documents:[]};
afterEach(cleanup);
describe("knowledge evidence", () => {
  it("renders an accessible expandable citation without interpreting evidence", async () => {
    const api = vi.fn(async (path:string) => path.endsWith("summary") ? emptySummary : ({ results: [result], retrievalId:"retrieval-1" }));
    render(<KnowledgeEvidence api={api} query="printer queue" />);
    const heading = await screen.findByRole("heading", {
      name: "Hardware: Printing",
    });
    expect(heading.closest("details")?.open).toBe(false);
    await userEvent.click(heading);
    expect(heading.closest("details")?.open).toBe(true);
    expect(screen.getByLabelText("Stable citation").textContent).toContain(
      result.citation.label,
    );
    expect(screen.getByText(/not a confirmed diagnosis/)).toBeTruthy();
  });
  it("shows the explicit no-results state", async () => {
    render(
      <KnowledgeEvidence
        api={vi.fn(async (path:string) => path.endsWith("summary") ? emptySummary : ({ results: [], retrievalId:"retrieval-2" }))}
        query="irrelevant lunch"
      />,
    );
    expect(
      await screen.findByText(
        "No sufficiently relevant approved evidence found.",
      ),
    ).toBeTruthy();
  });
  it("saves structured feedback, reports failure and retries with the same idempotency key", async()=>{
    let attempts=0; const bodies:unknown[]=[];
    const api=vi.fn(async(path:string,_method?:string,body?:unknown)=>{
      if(path.endsWith("summary")) return emptySummary;
      if(path.endsWith("feedback")){bodies.push(body);attempts++;if(attempts===1)throw new Error("Temporary failure");return {feedbackId:"feedback-1",createdAt:"2026-09-14T00:00:00Z",duplicate:false};}
      return {results:[result],retrievalId:"retrieval-3"};
    });
    const user=userEvent.setup(); render(<KnowledgeEvidence api={api} query="printer queue"/>);
    await user.click(await screen.findByRole("heading",{name:"Hardware: Printing"}));
    await user.click(screen.getByLabelText("Not helpful"));
    await user.selectOptions(screen.getByLabelText("Reason"),"outdated");
    await user.click(screen.getByRole("button",{name:"Save feedback"}));
    const alert=await screen.findByRole("alert"); expect(alert.textContent).toContain("Temporary failure"); expect(document.activeElement).toBe(alert);
    await user.click(screen.getByRole("button",{name:"Retry"}));
    const status=await screen.findByRole("status"); expect(status.textContent).toContain("Feedback saved"); expect(document.activeElement).toBe(status);
    expect((bodies[0] as any).clientEventId).toBe((bodies[1] as any).clientEventId);
    expect((bodies[1] as any).outcome).toBe("not_helpful");
  });
});
