import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Intake } from "../src/Intake";
import type { IntakeDraft } from "../shared/intake";

const draft: IntakeDraft = {
  summary: "VPN error 812",
  description:
    "VPN shows error 812 since 9:00 for three users; internet works and restart was tried.",
  requestType: "Incident",
  affectedService: "Network access",
  category: "Network",
  subcategory: "VPN or connectivity",
  symptoms: ["VPN error 812"],
  impact: "Medium",
  urgency: "Low",
  calculatedPriority: "P4",
  requesterName: "Synthetic User",
  requiredInformation: [],
  followUpQuestions: [],
  suspectedCauses: [
    { hypothesis: "A VPN client issue may be involved.", confirmed: false },
  ],
  suggestedAssignmentGroup: "Network Support",
  suggestionMethod: "Deterministic signal matching",
};
afterEach(cleanup);
describe("intelligent intake", () => {
  it("requires review confirmation before creating and sends explicit confirmation", async () => {
    const api = vi.fn(async (path: string) =>
      path.endsWith("/draft")
        ? draft
        : path.endsWith("/validate")
          ? { draft, valid: true }
          : { id: "INC-123" },
    );
    const created = vi.fn();
    render(
      <Intake
        api={api}
        requesterName="Synthetic User"
        onCancel={() => {}}
        onCreated={created}
      />,
    );
    await userEvent.type(
      screen.getByLabelText("Problem description"),
      draft.description,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Prepare structured draft" }),
    );
    const create = await screen.findByRole("button", {
      name: "Create confirmed incident",
    });
    expect((create as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(create);
    await waitFor(() => expect(created).toHaveBeenCalledWith("INC-123"));
    expect(api).toHaveBeenLastCalledWith("/intake/incidents", "POST", {
      draft,
      confirmed: true,
    });
  });
  it("resets a prepared draft and supports cancel", async () => {
    const cancel = vi.fn();
    const api = vi.fn(async () => draft);
    render(
      <Intake
        api={api}
        requesterName="Synthetic User"
        onCancel={cancel}
        onCreated={() => {}}
      />,
    );
    await userEvent.type(
      screen.getByLabelText("Problem description"),
      draft.description,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Prepare structured draft" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Reset intake" }),
    );
    expect(
      (screen.getByLabelText("Problem description") as HTMLTextAreaElement)
        .value,
    ).toBe("");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(cancel).toHaveBeenCalled();
  });
});
