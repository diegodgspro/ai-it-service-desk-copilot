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
};
afterEach(cleanup);
describe("knowledge evidence", () => {
  it("renders an accessible expandable citation without interpreting evidence", async () => {
    const api = vi.fn(async () => ({ results: [result] }));
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
        api={vi.fn(async () => ({ results: [] }))}
        query="irrelevant lunch"
      />,
    );
    expect(
      await screen.findByText(
        "No sufficiently relevant approved evidence found.",
      ),
    ).toBeTruthy();
  });
});
