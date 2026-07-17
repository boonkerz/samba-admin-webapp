import { useEffect, useState } from "react";
import type { LoginResponse, MeResponse, SetupStateResponse } from "@samba-admin/shared";
import { api } from "./api/client";
import { Wizard } from "./wizard/Wizard";
import { LoginPage } from "./auth/LoginPage";
import { ExplorerLayout } from "./directory/ExplorerLayout";
import { ToastHost } from "./components/Toast";
import { Spinner } from "./components/Spinner";

type Route = "loading" | "wizard" | "login" | "app";

export function App() {
  const [route, setRoute] = useState<Route>("loading");
  const [username, setUsername] = useState<string>();

  async function bootstrap() {
    const state = await api.get<SetupStateResponse>("/api/setup/state");
    if (state.state === "unprovisioned") {
      setRoute("wizard");
      return;
    }
    const me = await api.get<MeResponse>("/api/auth/me");
    if (me.authenticated && me.username) {
      setUsername(me.username);
      setRoute("app");
    } else {
      setRoute("login");
    }
  }

  useEffect(() => {
    bootstrap();
  }, []);

  function handleLoggedIn(identity: LoginResponse) {
    setUsername(identity.username);
    setRoute("app");
  }

  function handleLoggedOut() {
    setUsername(undefined);
    setRoute("login");
  }

  return (
    <>
      {route === "loading" && (
        <div className="flex h-screen items-center justify-center text-slate-400">
          <Spinner className="h-6 w-6" />
        </div>
      )}
      {route === "wizard" && <Wizard onFinished={() => setRoute("login")} />}
      {route === "login" && <LoginPage onLoggedIn={handleLoggedIn} />}
      {route === "app" && username && <ExplorerLayout username={username} onLoggedOut={handleLoggedOut} />}
      <ToastHost />
    </>
  );
}
