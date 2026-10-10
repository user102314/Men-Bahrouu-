import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";

import { Button } from "../components/ui/button.js";
import { api, HubError } from "../lib/api.js";
import { clearDevice, readDevice, useDeviceToken, writeDevice } from "../lib/device.js";
import { hubErrorText } from "../lib/errors.js";

export function SetupPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const stored = useDeviceToken();
  const [token, setToken] = useState(params.get("token") ?? stored ?? "");
  const [active, setActive] = useState(stored ?? "");
  const profiles = useQuery({
    queryKey: ["profiles", active],
    queryFn: api.profiles,
    enabled: active.length > 0,
    retry: false,
  });

  return (
    <section className="mx-auto grid max-w-lg gap-4">
      <h1 className="font-display text-4xl">{t("setup.title")}</h1>
      <p>{t("setup.help")}</p>
      <label className="grid gap-2">
        {t("setup.token")}
        <textarea
          className="min-h-28 rounded-[14px] border border-line bg-surface p-3"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <Button
        intent="primary"
        onClick={() => {
          const next = token.trim();
          writeDevice(next);
          setActive(next);
        }}
      >
        {t("setup.save")}
      </Button>
      {profiles.data ? (
        <p role="status">
          {t("setup.saved", { name: profiles.data.device.name, type: profiles.data.device.type })}
        </p>
      ) : null}
      {profiles.error ? (
        <p role="alert">
          {profiles.error instanceof HubError ? hubErrorText(profiles.error, t) : t("setup.invalid")}
        </p>
      ) : null}
      {readDevice() ? (
        <Button
          intent="danger"
          onClick={() => {
            clearDevice();
            setActive("");
            setToken("");
          }}
        >
          {t("setup.forget")}
        </Button>
      ) : null}
      <Link className="inline-flex min-h-12 items-center text-primary" to="/login">
        {t("login.submit")}
      </Link>
    </section>
  );
}
