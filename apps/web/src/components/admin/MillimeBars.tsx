import { formatMillimes, millimes } from "@resto/shared";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function MillimeBars({ rows }: { rows: { label: string; revenue_millimes: number }[] }) {
  const { i18n } = useTranslation();
  const locale = i18n.language.startsWith("ar") ? "ar" : "fr";
  return (
    <div className="h-60 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows}>
          <XAxis dataKey="label" />
          <YAxis />
          <Tooltip
            formatter={(value) => {
              const amount = Number(value);
              return Number.isSafeInteger(amount) && amount >= 0
                ? formatMillimes(millimes(amount), locale)
                : String(value);
            }}
          />
          <Bar dataKey="revenue_millimes" fill="var(--color-primary, #1d4e89)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
