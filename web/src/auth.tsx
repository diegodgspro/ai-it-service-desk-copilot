import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AuthenticationError, createApi, type Api } from "./api";

const AUDIENCE = "https://deskpilot-api";
type Session = {
  api: Api;
  displayName: string;
  local: boolean;
  logout?: () => void;
};
const SessionContext = createContext<Session | null>(null);
export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("Session required");
  return session;
}

export function LoginScreen({
  message,
  loading = false,
  onLogin,
  local = false,
}: {
  message?: string;
  loading?: boolean;
  onLogin?: () => void;
  local?: boolean;
}) {
  return (
    <div className="login-page">
      <section className="login-story" aria-label="About DeskPilot">
        <div className="brand">
          <span className="logo">
            dp<span>+</span>
          </span>{" "}
          DeskPilot
        </div>
        <span className="eyebrow">A WORKSPACE FOR THOUGHTFUL SUPPORT</span>
        <h1>
          Clarity for every incident.
          <br />
          Control at every step.
        </h1>
        <p>
          Investigate evidence, review the next step, and keep human judgment at
          the heart of service.
        </p>
        <div className="login-principles">
          <span>01 &nbsp; Understand the issue</span>
          <span>02 &nbsp; Review the evidence</span>
          <span>03 &nbsp; Decide with confidence</span>
        </div>
        <small>
          Portfolio lab · Synthetic incidents · Simulated automation
        </small>
      </section>
      <main className="login-panel">
        <div className="login-card">
          <span className="eyebrow">YOUR SERVICE DESK</span>
          <h2>Welcome to DeskPilot</h2>
          <p>Sign in to access your incident workspace.</p>
          {loading ? (
            <p role="status">Checking your session…</p>
          ) : (
            message && (
              <p className="alert error" role="alert">
                {message}
              </p>
            )
          )}
          {onLogin && (
            <button
              className="primary login-button"
              disabled={loading}
              onClick={onLogin}
            >
              {local ? "Enter local test workspace" : "Sign in with Auth0"}
            </button>
          )}
          <p className="login-caption">
            {local
              ? "Explicit loopback development identity. For local tests only."
              : "Secure sign-in with Universal Login. Workspace access is granted by your administrator."}
          </p>
        </div>
      </main>
    </div>
  );
}

export function AuthenticatedSession({ children }: { children: ReactNode }) {
  const {
    isLoading,
    isAuthenticated,
    error,
    user,
    loginWithRedirect,
    logout,
    getAccessTokenSilently,
  } = useAuth0();
  const [failure, setFailure] = useState("");
  const [redirecting, setRedirecting] = useState(false);
  const session = useMemo<Session>(() => {
    const request = createApi(() =>
      getAccessTokenSilently({ authorizationParams: { audience: AUDIENCE } }),
    );
    const api: Api = async (path, method, body) => {
      try {
        return await request(path, method, body);
      } catch (e) {
        if (e instanceof AuthenticationError) setFailure(e.message);
        throw e;
      }
    };
    return {
      api,
      displayName: user?.name || user?.email || "Signed-in technician",
      local: false,
      logout: () => {
        setRedirecting(true);
        void logout({
          logoutParams: { returnTo: window.location.origin },
        }).catch(() => {
          setRedirecting(false);
          setFailure("Sign-out could not be completed. Please try again.");
        });
      },
    };
  }, [getAccessTokenSilently, logout, user?.name, user?.email]);
  const login = () => {
    setFailure("");
    setRedirecting(true);
    void loginWithRedirect({
      authorizationParams: {
        audience: AUDIENCE,
        redirect_uri: window.location.origin,
      },
    }).catch(() => {
      setRedirecting(false);
      setFailure("Sign-in could not be completed. Please try again.");
    });
  };
  if (isLoading || redirecting) return <LoginScreen loading />;
  // Do not display SDK error descriptions, which may contain provider details.
  if (error || failure || !isAuthenticated)
    return (
      <LoginScreen
        message={
          failure || (error ? "Sign-in failed. Please try again." : undefined)
        }
        onLogin={login}
      />
    );
  return (
    <SessionContext.Provider value={session}>
      {children}
    </SessionContext.Provider>
  );
}

export function AuthRoot({ children }: { children: ReactNode }) {
  const [local, setLocal] = useState<boolean | null>(null);
  const [entered, setEntered] = useState(false);
  const [failure, setFailure] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/auth/local", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const config = (await response.json()) as { enabled?: boolean };
        if (active)
          setLocal(
            config.enabled === true &&
              window.location.protocol === "http:" &&
              ["127.0.0.1", "localhost", "[::1]"].includes(
                window.location.hostname,
              ),
          );
      })
      .catch(() => {
        if (active) setFailure(true);
      });
    return () => {
      active = false;
    };
  }, []);
  const localSession = useMemo<Session>(
    () => ({ api: createApi(), displayName: "Lab technician", local: true }),
    [],
  );
  if (failure)
    return (
      <LoginScreen message="Workspace configuration is unavailable. Reload to try again." />
    );
  if (local === null) return <LoginScreen loading />;
  if (local)
    return entered ? (
      <SessionContext.Provider value={localSession}>
        {children}
      </SessionContext.Provider>
    ) : (
      <LoginScreen local onLogin={() => setEntered(true)} />
    );
  const domain = import.meta.env.VITE_AUTH0_DOMAIN;
  const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
  if (
    !domain ||
    !/^[a-z0-9-]+(?:\.[a-z0-9-]+)?\.auth0\.com$/.test(domain) ||
    !clientId?.trim() ||
    import.meta.env.VITE_AUTH0_AUDIENCE !== AUDIENCE
  )
    return (
      <LoginScreen message="Sign-in is not configured. Contact the workspace administrator." />
    );
  return (
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      cacheLocation="memory"
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience: AUDIENCE,
        scope: "openid profile email",
      }}
      onRedirectCallback={() =>
        window.history.replaceState({}, document.title, "/")
      }
    >
      <AuthenticatedSession>{children}</AuthenticatedSession>
    </Auth0Provider>
  );
}
