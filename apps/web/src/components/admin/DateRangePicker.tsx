import { useTranslation } from "react-i18next";

import type { DateRange, PeriodPreset } from "../../lib/admin/period.js";
import { Button } from "../ui/button.js";

const PRESETS: PeriodPreset[] = ["today", "yesterday", "7", "30", "month"];

export function DateRangePicker({
  preset,
  range,
  onPreset,
  onRange,
}: {
  preset: PeriodPreset;
  range: DateRange;
  onPreset: (preset: PeriodPreset) => void;
  onRange: (range: DateRange) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-end gap-2">
      {PRESETS.map((item) => (
        <Button key={item} intent={preset === item ? "primary" : "quiet"} onClick={() => onPreset(item)}>
          {t(`admin.preset.${item}`)}
        </Button>
      ))}
      <label className="grid text-sm">
        {t("admin.from")}
        <input
          type="date"
          className="min-h-12 rounded-[12px] border border-line bg-fond px-2"
          value={range.from}
          onChange={(event) => {
            onPreset("custom");
            onRange({ from: event.target.value, to: range.to });
          }}
        />
      </label>
      <label className="grid text-sm">
        {t("admin.to")}
        <input
          type="date"
          className="min-h-12 rounded-[12px] border border-line bg-fond px-2"
          value={range.to}
          onChange={(event) => {
            onPreset("custom");
            onRange({ from: range.from, to: event.target.value });
          }}
        />
      </label>
    </div>
  );
}
