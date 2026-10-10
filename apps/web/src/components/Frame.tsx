import { Languages, LogOut, Moon, Sun, Wifi, WifiOff } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Outlet } from "react-router";

import { toggleLanguage } from "../i18n/index.js";
import { api } from "../lib/api.js";
import { clearSession, useSession } from "../lib/session.js";
import { useLink } from "./HubLink.js";
import { Button } from "./ui/button.js";

function toggleTheme(): void {
  const dark = document.documentElement.classList.toggle("dark");
  try {
    localStorage.setItem("resto.theme", dark ? "dark" : "light");
  } catch {
    /* ignore */
  }
}

export function Frame() {
  const { t } = useTranslation();
  const link = useLink();
  const session = useSession();
  const dark = document.documentElement.classList.contains("dark");

  useEffect(() => {
    if (!session) {
      return;
    }
    const delay = session.expiresAt - Date.now();
    const id = window.setTimeout(() => clearSession(), Math.max(0, delay));
    return () => window.clearTimeout(id);
  }, [session]);

  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-3">
        <p className="font-display text-2xl">Men Bahrouu</p>
        <p
          className="ms-auto inline-flex min-h-12 items-center gap-2 rounded-[12px] border border-line px-3"
          role="status"
          aria-live="polite"
        >
          {link === "connected" ? <Wifi aria-hidden /> : <WifiOff aria-hidden />}
          {t(`link.${link}`)}
        </p>
        <Button aria-label={t("common.language")} onClick={() => toggleLanguage()}>
          <Languages aria-hidden />
          {t("common.language")}
        </Button>
        <Button aria-label={dark ? t("common.themeLight") : t("common.themeDark")} onClick={toggleTheme}>
          {dark ? <Sun aria-hidden /> : <Moon aria-hidden />}
        </Button>
        {session ? (
          <Button
            onClick={() => {
              void api.logout().catch(() => undefined);
              clearSession();
            }}
          >
            <LogOut aria-hidden />
            {t("common.logout")}
          </Button>
        ) : null}
      </header>
      {link === "unreachable" ? (
        <p className="bg-terracotta px-4 py-3 text-white" role="alert">
          {t("banner.unreachable")}
        </p>
      ) : null}
      <main className="p-4">
        <Outlet />
      </main>
    </div>
  );
}
