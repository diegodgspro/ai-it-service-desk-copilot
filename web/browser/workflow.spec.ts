import { test, expect } from "@playwright/test";
test("create a reviewed incident through deterministic intake on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Enter local test workspace" })
    .click();
  await page.getByRole("button", { name: /New incident/ }).click();
  await expect(
    page.getByRole("heading", { name: "New incident" }),
  ).toBeVisible();
  const description =
    "Since 09:00 three users cannot connect to VPN. Error 812 appears, internet works and restart was tried.";
  await page.getByLabel("Problem description").fill(description);
  await page.getByRole("button", { name: "Prepare structured draft" }).click();
  await expect(
    page.getByText("Deterministic suggestion", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Suggested approved articles" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Network: VPN" }).first(),
  ).toBeVisible();
  await expect(page.getByLabel("Calculated priority")).toHaveValue("P4");
  await expect(page.getByText("Unconfirmed:")).toBeVisible();
  const create = page.getByRole("button", {
    name: "Create confirmed incident",
  });
  await expect(create).toBeDisabled();
  await page.getByRole("checkbox").check();
  await create.click();
  await expect(page.getByText(/created after confirmation/)).toBeVisible();
  await expect(page.locator(".case-heading h2")).toContainText(
    "Since 09:00 three users",
  );
});
test("review, simulate, invalidate and resolve an incident on desktop and mobile", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Enter local test workspace" })
    .click();
  await expect(
    page.getByRole("heading", { name: "A clearer path to resolution." }),
  ).toBeVisible();
  await page.getByRole("button", { name: /INC-1044/ }).click();
  await expect(page.locator(".case-heading h2")).toHaveText(
    "Warehouse printer appears offline",
  );
  // An edit both reopens a previously resolved fixture and invalidates its analysis.
  await page
    .getByRole("textbox", { name: "Description", exact: true })
    .fill(
      "LAB-PRN-003 is offline and shipping documents are stuck in the print queue. Four warehouse staff are affected. Labels are needed before the next dispatch. Browser verification " +
        Date.now() +
        ".",
    );
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Details saved");
  await page.getByRole("button", { name: /^Analyze ticket/ }).click();
  await expect(page.getByText("P2", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "A working hypothesis" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "02Knowledge" }).click();
  await expect(
    page.getByRole("heading", { name: "Hardware: Printing" }).first(),
  ).toBeVisible();
  await page
    .getByRole("heading", { name: "Hardware: Printing" })
    .first()
    .click();
  await expect(page.getByLabel("Stable citation").first()).toContainText(
    "kb-hardware-printing@1.0#",
  );
  await page.getByRole("button", { name: "03Automation" }).click();
  await page.getByRole("button", { name: "Approve simulation" }).click();
  await expect(
    page.getByRole("button", { name: "Approve simulation" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Decision recorded: approved. No action was executed."),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Enter local test workspace" })
    .click();
  await page.getByRole("button", { name: /INC-1044/ }).click();
  await expect(page.locator(".case-heading h2")).toHaveText(
    "Warehouse printer appears offline",
  );
  await page.getByRole("button", { name: "03Automation" }).click();
  await expect(
    page.getByRole("button", { name: "Approve simulation" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Reanalyze ticket" }).click();
  await expect(
    page.getByRole("button", { name: "Reject action" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Reject action" }).click();
  await expect(
    page.getByText("Decision recorded: rejected. No action was executed."),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Printer offline; lab user reports pending print jobs.");
  await expect(
    page.getByRole("button", { name: "Save details" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Approve simulation" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByRole("status")).toContainText("Details saved");
  await page.getByRole("button", { name: /^Analyze ticket/ }).click();
  await page.getByRole("button", { name: "04Handover" }).click();
  await page
    .getByRole("combobox", { name: "Next status" })
    .selectOption("Resolved");
  await page
    .getByRole("textbox", { name: "Technician evidence / handover note" })
    .fill(
      "Synthetic browser check: the lab user confirmed printing was restored.",
    );
  await expect(
    page.getByRole("button", { name: "Save handover" }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: "The user confirmed service restoration" })
    .check();
  await page.getByRole("button", { name: "Save handover" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Handover saved to the incident history.",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Enter local test workspace" })
    .click();
  await page.getByRole("button", { name: /INC-1044/ }).click();
  await expect(page.locator(".case-heading h2")).toHaveText(
    "Warehouse printer appears offline",
  );
  await expect(page.locator(".case-heading .status")).toHaveText("Resolved");
  // Return fixture details to their authored values; retain the honest test audit trail.
  await page
    .getByRole("textbox", { name: "Description", exact: true })
    .fill(
      "LAB-PRN-003 is offline and shipping documents are stuck in the print queue. Four warehouse staff are affected. Labels are needed before the next dispatch.",
    );
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByRole("status")).toContainText("Details saved");
  await page.getByRole("button", { name: /^Analyze ticket/ }).click();
  await page.getByRole("button", { name: "01Analysis" }).click();
  await expect(page.getByText("P2", { exact: true })).toBeVisible();
  await page.screenshot({
    path: ".test-build/dashboard-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "A clearer path to resolution." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".test-build/dashboard-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
