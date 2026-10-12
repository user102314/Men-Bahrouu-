import { formatMillimes, millimes } from "@resto/shared";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, Tooltip, XAxis, YAxis } from "recharts";

export function MillimeBars({ rows }: { rows: { label: string; revenue_millimes: number }[] }) {
  const { i18n } = useTranslation();
  const locale = i18n.language.startsWith("ar") ? "ar" : "fr";
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);

  useEffect(() => {
    const element = host.current;
    if (!element) {
      return;
    }
    const apply = (next: number) => {
      const rounded = Math.max(280, Math.floor(next));
      setWidth((current) => (current === rounded ? current : rounded));
    };
    apply(element.clientWidth);
    const observer = new ResizeObserver((entries) => {
      apply(entries[0]?.contentRect.width ?? element.clientWidth);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={host} className="h-60 w-full">
      <BarChart width={width} height={240} data={rows}>
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
        <Bar dataKey="revenue_millimes" fill="var(--color-primary, #0f5fa8)" />
      </BarChart>
    </div>
  );
}
