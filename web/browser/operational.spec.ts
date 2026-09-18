import { test, expect } from "@playwright/test";
import { blockUnexpectedExternalRequests } from "./network";
test.beforeEach(async ({ page }) => {
  await blockUnexpectedExternalRequests(page);
});
test("analysis snapshots persist after refresh with keyboard access at 390px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Enter local test workspace" })
    .click();
  await page.getByRole("button", { name: /INC-1042/ }).click();
  await page
    .getByRole("button", { name: /^(Analyze ticket|Reanalyze ticket)/ })
    .click();
  await expect(page.getByRole("status")).toBeVisible();
  const history = page
    .locator("details.history")
    .filter({ has: page.locator("summary", { hasText: "Analysis history" }) });
  await history.locator(":scope > summary").focus();
  await page.keyboard.press("Enter");
  await expect(
    history.getByRole("heading", { name: /Incident version/ }).first(),
  ).toBeVisible();
  const first = await history
    .getByRole("heading", { name: /Incident version/ })
    .first()
    .textContent();
  const refreshedHistory = page.waitForResponse(
    (response) =>
      response.url().endsWith("/INC-1042/analyses") && response.ok(),
  );
  await page.getByRole("button", { name: "Reanalyze ticket" }).click();
  await refreshedHistory;
  await history.locator(":scope > summary").click();
  await expect(
    history.getByRole("heading", { name: /Incident version/ }).nth(1),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Enter local test workspace" })
    .click();
  await history.locator(":scope > summary").click();
  await expect(
    history.getByRole("heading", { name: first!, exact: true }),
  ).toBeVisible();
  await expect(history.getByText(/not confirmed causes/)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("queue load more retries the same cursor without losing loaded incidents", async ({
  page,
}) => {
  let nextCalls = 0;
  await page.route("**/api/tickets/page*", async (route) => {
    const query = new URL(route.request().url()).searchParams;
    const response = await route.fetch();
    const payload = await response.json();
    if (!query.has("cursor")) {
      await route.fulfill({
        json: { items: payload.items.slice(0, 2), nextCursor: "test-cursor" },
      });
      return;
    }
    nextCalls++;
    if (nextCalls === 1) {
      await route.fulfill({
        status: 503,
        json: { error: "Temporary page failure" },
      });
      return;
    }
    // Keep the backend read authentic, while controlling pagination transport states.
    const first = await page.request.get("/api/tickets/page");
    const all = await first.json();
    await route.fulfill({
      json: { items: all.items.slice(2, 4), nextCursor: null },
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Enter local test workspace" })
    .click();
  const more = page.getByRole("button", { name: "Load more incidents" });
  await more.focus();
  await page.keyboard.press("Enter");
  const error = page
    .getByRole("alert")
    .filter({ hasText: "Temporary page failure" });
  await expect(error).toBeFocused();
  await page.getByRole("button", { name: "Retry incidents" }).click();
  await expect(page.locator(".ticket-list > button")).toHaveCount(4);
  expect(nextCalls).toBe(2);
  await expect(
    page.getByText("incidents loaded.", { exact: true }),
  ).toBeFocused();
  await page.locator(".ticket-list > button").last().click();
  await expect(page.locator(".ticket-list > button")).toHaveCount(4);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
