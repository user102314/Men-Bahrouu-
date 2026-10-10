import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate } from "react-router";

import { PinPad } from "../components/PinPad.js";
import { Button } from "../components/ui/button.js";
import { api, type DeviceProfiles } from "../lib/api.js";
import { useDeviceToken } from "../lib/device.js";
import { hubErrorText } from "../lib/errors.js";
import { homeFor, saveSession, sessionFromToken, useSession } from "../lib/session.js";

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const session = useSession();
  const device = useDeviceToken();
  const profiles = useQuery({
    queryKey: ["profiles", device],
    queryFn: api.profiles,
    enabled: Boolean(device),
    retry: false,
  });
  const [selected, setSelected] = useState<DeviceProfiles["profiles"][number] | null>(null);
  const [admin, setAdmin] = useState(!device);
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!error) {
      return;
    }
    const id = window.setTimeout(() => setShake(false), 400);
    return () => window.clearTimeout(id);
  }, [error]);

  if (session) {
    return <Navigate to={homeFor(session.role)} replace />;
  }

  async function enter(action: () => Promise<{ token: string }>, displayName: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      const draft = sessionFromToken(result.token, displayName);
      if (!draft) {
        setError(t("errors.unknown"));
        setShake(true);
        return;
      }
      saveSession(draft);
      const me = await api.me();
      saveSession({ ...draft, displayName: me.displayName, role: me.role });
      navigate(homeFor(me.role));
    } catch (caught) {
      setError(hubErrorText(caught, t));
      setShake(true);
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  const waiterBlocked =
    profiles.data?.device.type === "PHONE" &&
    profiles.data.profiles.every((profile) => profile.role === "ADMIN");

  return (
    <section className="mx-auto grid max-w-3xl gap-5">
      <h1 className="font-display text-4xl">{t("login.title")}</h1>
      {!device ? <p>{t("login.noDevice")}</p> : null}
      {waiterBlocked ? <p role="status">{t("login.phoneWaiter")}</p> : null}
      {device && profiles.isPending ? <p>{t("common.loading")}</p> : null}
      {device ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(profiles.data?.profiles ?? []).map((profile) => (
            <Button
              key={profile.id}
              intent={selected?.id === profile.id && !admin ? "primary" : "quiet"}
              className="min-h-24 flex-col"
              onClick={() => {
                setSelected(profile);
                setAdmin(profile.role === "ADMIN");
                setPin("");
                setError(null);
              }}
            >
              <span className="text-3xl" aria-hidden>
                {profile.displayName.slice(0, 1)}
              </span>
              {profile.displayName}
            </Button>
          ))}
          <Button intent={admin ? "primary" : "quiet"} className="min-h-24" onClick={() => setAdmin(true)}>
            {t("login.admin")}
          </Button>
        </div>
      ) : null}
      {profiles.error ? <p role="alert">{hubErrorText(profiles.error, t)}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {!admin && selected && selected.role !== "ADMIN" ? (
        <PinPad
          value={pin}
          onChange={(value) => {
            setPin(value);
            setError(null);
          }}
          onSubmit={() => {
            if (!selected) {
              return;
            }
            void enter(() => api.loginPin(selected.id, pin), selected.displayName);
          }}
          error={shake}
          disabled={busy}
          submitLabel={t("login.submit")}
          backspaceLabel={t("login.backspace")}
        />
      ) : null}
      {admin || !device ? (
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void enter(() => api.loginAdmin(email, password), email);
          }}
        >
          <label className="grid gap-2">
            {t("login.email")}
            <input
              className="min-h-14 rounded-[12px] border border-line bg-surface px-3"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="grid gap-2">
            {t("login.password")}
            <input
              className="min-h-14 rounded-[12px] border border-line bg-surface px-3"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <Button intent="primary" type="submit" disabled={busy}>
            {t("login.submit")}
          </Button>
        </form>
      ) : null}
      <Link className="inline-flex min-h-12 items-center" to="/setup">
        {t("login.setup")}
      </Link>
    </section>
  );
}
