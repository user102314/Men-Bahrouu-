import { useTranslation } from "react-i18next";

import { parseMoneyDraft } from "../../lib/admin/money-draft.js";
import { fieldClass } from "./widgets.js";

export function MoneyInput({
  id,
  value,
  onChange,
  ceilingMillimes = 1_000_000,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  ceilingMillimes?: number;
}) {
  const { t } = useTranslation();
  const draft = parseMoneyDraft(value, ceilingMillimes);
  return (
    <div className="grid gap-1">
      <input
        id={id}
        inputMode="decimal"
        className={fieldClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {draft.error === "thousands" ? <p className="text-sm text-terracotta">{t("admin.moneyThousands")}</p> : null}
      {draft.error === "invalid" ? <p className="text-sm text-terracotta">{t("admin.moneyInvalid")}</p> : null}
      {draft.hint ? <p className="text-sm text-ink/70">{t("admin.moneyHint")}</p> : null}
      {draft.needsConfirm ? <p className="text-sm text-accent">{t("admin.moneyHigh")}</p> : null}
    </div>
  );
}
