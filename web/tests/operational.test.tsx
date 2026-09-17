import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { IncidentHistory } from "../src/IncidentHistory";
import { createApi } from "../src/api";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const snapshot = (id: number) => ({
  id,
  analysis_id: `analysis-${id}`,
  incident_version: id,
  schema_version: 1,
  actor: "server-actor",
  created_at: "2026-09-17T10:00:00Z",
  analysis: { hypothesis: `Hypothesis ${id}`, priority: "P4" },
  evidence: [],
});
it("paginates snapshots, focuses retry errors, retains rows and explains legacy history", async () => {
  let failed = false;
  const api = vi.fn(
    async (
      path: string,
      _method?: string,
      _body?: unknown,
      query?: Record<string, string>,
    ) => {
      if (path.endsWith("audit")) return { items: [], nextCursor: null };
      if (query?.cursor) {
        if (!failed) {
          failed = true;
          throw new Error("Temporary failure");
        }
        return { items: [snapshot(1)], nextCursor: null };
      }
      return { items: [snapshot(2)], nextCursor: "opaque" };
    },
  );
  const user = userEvent.setup();
  render(<IncidentHistory api={api as any} id="INC-1042" />);
  await user.click(screen.getByText("Analysis history"));
  expect(await screen.findByText("Incident version 2")).toBeTruthy();
  expect(
    screen.getByText(/earlier snapshots were not reconstructed/),
  ).toBeTruthy();
  const more = screen.getByRole("button", { name: "Load more analyses" });
  more.focus();
  await user.keyboard("{Enter}");
  const alert = await screen.findByRole("alert");
  expect(document.activeElement).toBe(alert);
  await user.click(screen.getByRole("button", { name: "Retry analyses" }));
  expect(await screen.findByText("Incident version 1")).toBeTruthy();
  expect(screen.getByText("Incident version 2")).toBeTruthy();
  await waitFor(() =>
    expect(document.activeElement?.textContent).toBe("analyses loaded."),
  );
  expect(
    screen.queryByRole("button", { name: "Load more analyses" }),
  ).toBeNull();
  expect(api.mock.calls.at(-1)?.[3]).toEqual({ cursor: "opaque" });
});
it("shows an explicit empty analysis history", async () => {
  render(
    <IncidentHistory
      api={vi.fn(async () => ({ items: [], nextCursor: null })) as any}
      id="INC-1042"
    />,
  );
  expect(
    await screen.findByText("No analysis snapshots recorded yet."),
  ).toBeTruthy();
});
it("encodes cursor values while preserving same-origin token confinement", async () => {
  const fetcher = vi.fn(
    async (_url: string, _options: RequestInit) =>
      new Response(JSON.stringify({ items: [], nextCursor: null })),
  );
  vi.stubGlobal("fetch", fetcher);
  const api = createApi(async () => "test-token");
  await api("/tickets/page", "GET", undefined, {
    cursor: "opaque&next=https://evil.invalid",
  });
  expect(fetcher.mock.calls[0]?.[0]).toBe(
    "/api/tickets/page?cursor=opaque%26next%3Dhttps%3A%2F%2Fevil.invalid",
  );
  await expect(api("//evil.invalid")).rejects.toThrow("Invalid API path");
});
