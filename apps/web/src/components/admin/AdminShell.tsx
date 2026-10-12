import { useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet } from "react-router";

import { NAV_GROUPS, visibleNav } from "../../lib/admin/nav.js";
import { useSession } from "../../lib/session.js";
import { cn } from "../../lib/cn.js";

function ItemList({ onPick }: { onPick?: () => void }) {
  const { t } = useTranslation();
  const session = useSession();
  if (!session) {
    return null;
  }
  const items = visibleNav(session.role);
  return (
    <div className="grid gap-4">
      {NAV_GROUPS.map((group) => {
        const groupItems = items.filter((item) => item.group === group);
        if (groupItems.length === 0) {
          return null;
        }
        return (
          <section key={group}>
            <h2 className="mb-1 px-3 text-sm text-ink/60">{t(`admin.group.${group}`)}</h2>
            <ul>
              {groupItems.map((item) => (
                <li key={item.to}>
                  {item.later ? (
                    <p className="flex min-h-12 items-center justify-between px-3 text-ink/50">
                      <span>{t(item.labelKey)}</span>
                      <span className="text-sm">{t("admin.later")}</span>
                    </p>
                  ) : (
                    <NavLink
                      to={item.to}
                      end={item.to === "/admin"}
                      onClick={onPick}
                      className={({ isActive }) =>
                        cn(
                          "flex min-h-12 items-center rounded-[12px] px-3",
                          isActive ? "bg-primary text-white" : "text-ink",
                        )
                      }
                    >
                      {t(item.labelKey)}
                    </NavLink>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export function AdminShell() {
  const { t } = useTranslation();
  const [more, setMore] = useState(false);
  return (
    <div className="flex min-h-[calc(100vh-4.5rem)]">
      <aside className="no-print hidden w-64 shrink-0 overflow-y-auto border-e border-line bg-surface p-3 md:block">
        <ItemList />
      </aside>
      <main className="min-w-0 flex-1 p-1 pb-28 sm:p-2 md:p-4 md:pb-6">
        <Outlet />
      </main>
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        <NavLink to="/admin" end className="flex min-h-14 items-center justify-center px-1 text-center text-xs leading-tight">
          {t("admin.dashboard")}
        </NavLink>
        <NavLink to="/admin/orders" className="flex min-h-14 items-center justify-center px-1 text-center text-xs leading-tight">
          {t("admin.orders")}
        </NavLink>
        <NavLink to="/admin/alerts" className="flex min-h-14 items-center justify-center px-1 text-center text-xs leading-tight">
          {t("admin.alerts")}
        </NavLink>
        <button type="button" className="min-h-14 px-1 text-xs leading-tight" onClick={() => setMore(true)}>
          {t("admin.more")}
        </button>
      </nav>
      {more ? (
        <div className="no-print fixed inset-0 z-40 overflow-y-auto bg-fond p-4 md:hidden">
          <button type="button" className="mb-4 min-h-12" onClick={() => setMore(false)}>
            {t("common.close")}
          </button>
          <ItemList onPick={() => setMore(false)} />
        </div>
      ) : null}
    </div>
  );
}
