import { test, expect, type Page } from "@playwright/test";
import { generateKeyPair, SignJWT } from "jose";

// The real SDK runs against intercepted OAuth endpoints. No tenant is contacted.
async function mockAuth0(
  page: Page,
  options: {
    denied?: boolean;
    tokenFailure?: boolean;
    apiStatus?: number;
  } = {},
) {
  const origin = "http://127.0.0.1:8787";
  const issuer = "https://fixture.us.auth0.com/";
  const client = "synthetic-browser-client";
  const { privateKey } = await generateKeyPair("RS256");
  let nonce = "";
  const seen: string[] = [];
  const queue = await (await page.request.get("/api/tickets")).json();
  const detail = await (await page.request.get("/api/tickets/INC-1042")).json();
  await page.route("**/auth/local", (route) =>
    route.fulfill({ json: { enabled: false } }),
  );
  await page.route(issuer + "**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/authorize") {
      expect(url.searchParams.get("audience")).toBe("https://deskpilot-api");
      expect(url.searchParams.get("redirect_uri")).toBe(origin);
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
      nonce = url.searchParams.get("nonce")!;
      const query = new URLSearchParams({
        state: url.searchParams.get("state")!,
        ...(options.denied
          ? {
              error: "access_denied",
              error_description: "Synthetic login denial",
            }
          : { code: "synthetic-code" }),
      });
      await route.fulfill({
        status: 302,
        headers: { location: origin + "/?" + query },
      });
    } else if (url.pathname === "/oauth/token") {
      const headers = {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "Content-Type, Auth0-Client",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      };
      if (route.request().method() === "OPTIONS")
        return route.fulfill({ headers });
      if (options.tokenFailure)
        return route.fulfill({
          status: 400,
          headers,
          json: {
            error: "invalid_grant",
            error_description: "Synthetic exchange failure",
          },
        });
      const now = Math.floor(Date.now() / 1000);
      const id = await new SignJWT({
        iss: issuer,
        aud: client,
        sub: "auth0|browser-fixture",
        name: "Synthetic Technician",
        email: "fixture@example.invalid",
        nonce,
        iat: now,
        exp: now + 3600,
      })
        .setProtectedHeader({ alg: "RS256", kid: "browser-fixture" })
        .sign(privateKey);
      await route.fulfill({
        headers,
        json: {
          access_token: "synthetic-browser-access-token",
          id_token: id,
          token_type: "Bearer",
          expires_in: 3600,
          scope: "openid profile email",
        },
      });
    } else if (
      url.pathname === "/v2/logout" ||
      url.pathname === "/oidc/logout"
    ) {
      expect(
        url.searchParams.get("returnTo") ||
          url.searchParams.get("post_logout_redirect_uri"),
      ).toBe(origin);
      await route.fulfill({ status: 302, headers: { location: origin } });
    } else throw new Error("Unexpected mock Auth0 endpoint: " + url.pathname);
  });
  await page.route("**/api/**", async (route) => {
    seen.push(route.request().headers()["authorization"]);
    await route.fulfill({
      status: options.apiStatus || 200,
      json: options.apiStatus
        ? { error: "Denied" }
        : route.request().url().endsWith("/tickets")
          ? queue
          : detail,
    });
  });
  return seen;
}

test("anonymous login, PKCE callback, bearer API calls, profile and logout with mocked Auth0", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const seen = await mockAuth0(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welcome to DeskPilot" }),
  ).toBeVisible();
  expect(seen).toEqual([]);
  await page.screenshot({
    path: ".test-build/login-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".test-build/login-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sign in with Auth0" }).click();
  await expect(
    page.getByRole("heading", { name: "A clearer path to resolution." }),
  ).toBeVisible();
  await expect(page.getByText("Synthetic Technician").first()).toBeVisible();
  expect(seen.length).toBeGreaterThan(0);
  expect(
    seen.every((value) => value === "Bearer synthetic-browser-access-token"),
  ).toBe(true);
  expect(await page.locator("body").innerText()).not.toContain(
    "synthetic-browser-access-token",
  );
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    "synthetic-browser-access-token",
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign in with Auth0" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

for (const scenario of [
  { name: "login denied", denied: true, message: "Sign-in failed" },
  {
    name: "token exchange fails",
    tokenFailure: true,
    message: "Sign-in failed",
  },
  {
    name: "API unauthorized",
    apiStatus: 401,
    message: "Your session is not authorized",
  },
  {
    name: "API read permission denied",
    apiStatus: 403,
    message: "You do not have permission",
  },
])
  test(scenario.name, async ({ page }) => {
    await mockAuth0(page, scenario);
    await page.goto("/");
    await page.getByRole("button", { name: "Sign in with Auth0" }).click();
    await expect(page.getByRole("alert")).toContainText(scenario.message);
    await expect(page.getByRole("button", { name: /^INC-/ })).toHaveCount(0);
  });
