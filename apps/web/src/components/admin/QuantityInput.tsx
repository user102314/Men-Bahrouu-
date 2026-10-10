import type { BaseUnit } from "@resto/shared";
import { useTranslation } from "react-i18next";

import { displayUnitsFor, toBaseQuantity, type DisplayUnit } from "../../lib/admin/quantity.js";
import { fieldClass } from "./widgets.js";

export function QuantityInput({
  id,
  raw,
  unit,
  base,
  onRaw,
  onUnit,
}: {
  id: string;
  raw: string;
  unit: DisplayUnit;
  base: BaseUnit;
  onRaw: (value: string) => void;
  onUnit: (unit: DisplayUnit) => void;
}) {
  const { t } = useTranslation();
  const invalid = raw.trim().length > 0 && toBaseQuantity(raw, unit) === null;
  return (
    <div className="grid gap-1">
      <div className="flex gap-2">
        <input id={id} inputMode="decimal" className={fieldClass} value={raw} onChange={(event) => onRaw(event.target.value)} />
        <select className={fieldClass} value={unit} onChange={(event) => onUnit(event.target.value as DisplayUnit)}>
          {displayUnitsFor(base).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      {invalid ? <p className="text-sm text-terracotta">{t("admin.quantityInvalid")}</p> : null}
    </div>
  );
}
