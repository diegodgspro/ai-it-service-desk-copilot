import type { Page } from "@playwright/test";

const LOOPBACK_ORIGIN = "http://127.0.0.1:8787";

export async function blockUnexpectedExternalRequests(page: Page) {
  const unexpected: string[] = [];
  await page.route("**/*", (route) => {
    if (new URL(route.request().url()).origin === LOOPBACK_ORIGIN)
      return route.continue();
    unexpected.push("external-request");
    throw new Error("Unexpected external request was not intercepted");
  });
  return unexpected;
}
