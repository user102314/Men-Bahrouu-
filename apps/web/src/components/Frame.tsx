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
      <header className="no-print flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2 sm:px-4 sm:py-3">
        <p className="me-auto font-display text-xl sm:text-2xl">Men Bahrouu</p>
        <div className="flex max-w-full flex-wrap items-center gap-2">
          <p
            className="inline-flex min-h-11 items-center gap-2 rounded-[12px] border border-line px-3 text-sm"
            role="status"
            aria-live="polite"
          >
            {link === "connected" ? <Wifi aria-hidden /> : <WifiOff aria-hidden />}
            <span className="max-w-36 truncate sm:max-w-none">{t(`link.${link}`)}</span>
          </p>
          <Button aria-label={t("common.language")} onClick={() => toggleLanguage()}>
            <Languages aria-hidden />
            <span className="hidden sm:inline">{t("common.language")}</span>
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
              <span className="hidden sm:inline">{t("common.logout")}</span>
            </Button>
          ) : null}
        </div>
      </header>
      {link === "unreachable" ? (
        <p className="no-print bg-terracotta px-4 py-3 text-white" role="alert">
          {t("banner.unreachable")}
        </p>
      ) : null}
      <main className="p-3 sm:p-4">
        <Outlet />
      </main>
    </div>
  );
}
