import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthRoot, AuthenticatedSession, useSession } from "../src/auth";
import { AuthenticationError, createApi, PermissionError } from "../src/api";

const sdk = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  provider: vi.fn(),
}));
vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => sdk.state,
  Auth0Provider: (props: { children: React.ReactNode }) => {
    sdk.provider(props);
    return props.children;
  },
}));
function Workspace() {
  const session = useSession();
  return (
    <>
      <h1>Private workspace</h1>
      <p>{session.displayName}</p>
      <button onClick={session.logout}>Sign out</button>
      <button onClick={() => void session.api("/tickets").catch(() => {})}>
        Load tickets
      </button>
    </>
  );
}
beforeEach(() => {
  sdk.state = {
    isLoading: false,
    isAuthenticated: false,
    loginWithRedirect: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    getAccessTokenSilently: vi.fn().mockResolvedValue("mock-access-token"),
  };
  sdk.provider.mockClear();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("Auth0 session UI", () => {
  it("shows the anonymous screen without mounting the workspace or calling the API", async () => {
    render(
      <AuthenticatedSession>
        <Workspace />
      </AuthenticatedSession>,
    );
    expect(screen.queryByText("Private workspace")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Sign in with Auth0" }),
    );
    expect(sdk.state.loginWithRedirect).toHaveBeenCalledWith({
      authorizationParams: {
        audience: "https://deskpilot-api",
        redirect_uri: window.location.origin,
      },
    });
  });
  it("waits for SDK initialization", () => {
    sdk.state.isLoading = true;
    render(
      <AuthenticatedSession>
        <Workspace />
      </AuthenticatedSession>,
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Checking your session",
    );
    expect(screen.queryByText("Private workspace")).toBeNull();
  });
  it("handles callback failure without exposing provider details", () => {
    sdk.state.error = new Error("secret-provider-diagnostic");
    render(
      <AuthenticatedSession>
        <Workspace />
      </AuthenticatedSession>,
    );
    expect(screen.getByRole("alert").textContent).toBe(
      "Sign-in failed. Please try again.",
    );
    expect(document.body.textContent).not.toContain(
      "secret-provider-diagnostic",
    );
  });
  it("handles login rejection and allows retry", async () => {
    sdk.state.loginWithRedirect = vi
      .fn()
      .mockRejectedValue(new Error("provider detail"));
    render(
      <AuthenticatedSession>
        <Workspace />
      </AuthenticatedSession>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Sign in with Auth0" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Sign-in could not be completed",
    );
    expect(
      screen.getByRole("button", { name: "Sign in with Auth0" }),
    ).toBeTruthy();
  });
  it.each([
    { name: "Synthetic Technician", email: "fixture@example.invalid" },
    { email: "fixture@example.invalid" },
  ])("shows name or email and logs out to the same origin", async (user) => {
    sdk.state.isAuthenticated = true;
    sdk.state.user = user;
    render(
      <AuthenticatedSession>
        <Workspace />
      </AuthenticatedSession>,
    );
    expect(
      screen.getByText("name" in user ? user.name! : user.email),
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain("mock-access-token");
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(sdk.state.logout).toHaveBeenCalledWith({
      logoutParams: { returnTo: window.location.origin },
    });
    expect(screen.queryByText("Private workspace")).toBeNull();
  });
  it.each(["token", "401"])(
    "removes protected content on %s failure and offers sign-in",
    async (failure) => {
      sdk.state.isAuthenticated = true;
      if (failure === "token")
        sdk.state.getAccessTokenSilently = vi
          .fn()
          .mockRejectedValue(new Error("sensitive-token"));
      else
        vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 401 }));
      render(
        <AuthenticatedSession>
          <Workspace />
        </AuthenticatedSession>,
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Load tickets" }),
      );
      expect(await screen.findByRole("alert")).toBeTruthy();
      expect(screen.queryByText("Private workspace")).toBeNull();
      expect(document.body.textContent).not.toContain("sensitive-token");
      expect(
        screen.getByRole("button", { name: "Sign in with Auth0" }),
      ).toBeTruthy();
    },
  );
  it("requests the API audience and propagates the access token", async () => {
    sdk.state.isAuthenticated = true;
    render(
      <AuthenticatedSession>
        <Workspace />
      </AuthenticatedSession>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Load tickets" }));
    expect(sdk.state.getAccessTokenSilently).toHaveBeenCalledWith({
      authorizationParams: { audience: "https://deskpilot-api" },
    });
    expect(vi.mocked(fetch).mock.calls[0][1]?.headers).toBeInstanceOf(Headers);
    expect(
      new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).get(
        "Authorization",
      ),
    ).toBe("Bearer mock-access-token");
  });
  it("configures the official provider with memory caching and non-secret values", async () => {
    vi.stubEnv("VITE_AUTH0_DOMAIN", "fixture.us.auth0.com");
    vi.stubEnv("VITE_AUTH0_CLIENT_ID", "synthetic-client-id");
    vi.stubEnv("VITE_AUTH0_AUDIENCE", "https://deskpilot-api");
    vi.mocked(fetch).mockResolvedValue(new Response('{"enabled":false}'));
    render(
      <AuthRoot>
        <Workspace />
      </AuthRoot>,
    );
    await screen.findByRole("button", { name: "Sign in with Auth0" });
    expect(sdk.provider).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: "fixture.us.auth0.com",
        clientId: "synthetic-client-id",
        cacheLocation: "memory",
        authorizationParams: {
          audience: "https://deskpilot-api",
          redirect_uri: window.location.origin,
          scope: "openid profile email",
        },
      }),
    );
  });
  it("fails closed when frontend configuration is missing", async () => {
    vi.stubEnv("VITE_AUTH0_DOMAIN", "");
    render(
      <AuthRoot>
        <Workspace />
      </AuthRoot>,
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Sign-in is not configured",
    );
    expect(sdk.provider).not.toHaveBeenCalled();
  });
});
describe("API transport", () => {
  it("sends bearer and JSON on writes without cookies or following redirects", async () => {
    await createApi(async () => "fixture-token")(
      "/tickets/INC-1042/analyze",
      "POST",
      { version: 1 },
    );
    const [path, options] = vi.mocked(fetch).mock.calls[0];
    expect(path).toBe("/api/tickets/INC-1042/analyze");
    expect(new Headers(options?.headers).get("Authorization")).toBe(
      "Bearer fixture-token",
    );
    expect(new Headers(options?.headers).get("Content-Type")).toBe(
      "application/json",
    );
    expect(options).toMatchObject({
      method: "POST",
      body: '{"version":1}',
      credentials: "omit",
      redirect: "error",
    });
  });
  it.each([401, 403])("reports HTTP %s clearly", async (status) => {
    vi.mocked(fetch).mockResolvedValue(new Response("{}", { status }));
    await expect(
      createApi(async () => "fixture-token")("/tickets"),
    ).rejects.toBeInstanceOf(
      status === 401 ? AuthenticationError : PermissionError,
    );
  });
  it("never sends a request if token acquisition fails", async () => {
    await expect(
      createApi(async () => {
        throw new Error("secret");
      })("/tickets"),
    ).rejects.toThrow("Unable to obtain an access token");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects token destinations outside the API", async () => {
    await expect(
      createApi(async () => "fixture-token")("//attacker.invalid"),
    ).rejects.toThrow("Invalid API path");
    expect(fetch).not.toHaveBeenCalled();
  });
});
