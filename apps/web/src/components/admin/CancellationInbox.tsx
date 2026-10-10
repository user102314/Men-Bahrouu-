import { useTranslation } from "react-i18next";

import { Button } from "../ui/button.js";
import { EmptyState } from "./widgets.js";

export function CancellationInbox({
  rows,
  onDecide,
}: {
  rows: { id: string; orderId: string; reason: string }[];
  onDecide: (id: string, approve: boolean) => void;
}) {
  const { t } = useTranslation();
  if (rows.length === 0) {
    return <EmptyState>{t("admin.empty")}</EmptyState>;
  }
  return (
    <ul className="grid gap-3">
      {rows.map((row) => (
        <li key={row.id} className="rounded-[14px] border border-line bg-surface p-4">
          <p className="text-sm text-ink/70">{row.orderId}</p>
          <p className="mt-1">{row.reason}</p>
          <div className="mt-3 flex gap-2">
            <Button intent="primary" onClick={() => onDecide(row.id, true)}>
              {t("admin.approve")}
            </Button>
            <Button intent="danger" onClick={() => onDecide(row.id, false)}>
              {t("admin.refuse")}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
