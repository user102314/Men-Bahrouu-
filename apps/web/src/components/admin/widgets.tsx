import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "../../lib/cn.js";
import { Button } from "../ui/button.js";
import { Dialog } from "../ui/dialog.js";

export const fieldClass =
  "min-h-12 w-full rounded-[12px] border border-line bg-fond px-3 text-base text-ink";

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <h1 className="font-display text-3xl">{title}</h1>
      {children}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <article className="rounded-[14px] border border-line bg-surface p-4">
      <p className="text-sm text-ink/70">{label}</p>
      <p className="mt-1 font-display text-3xl">{value}</p>
      {detail ? <p className="mt-1 text-sm text-ink/70">{detail}</p> : null}
    </article>
  );
}

export function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[14px] border border-line bg-surface p-4">
      <h2 className="mb-3 font-display text-xl">{title}</h2>
      {children}
    </section>
  );
}

export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-[14px] border border-line bg-surface p-4">
      <legend className="px-2 font-display text-xl">{title}</legend>
      <div className="grid gap-3">{children}</div>
    </fieldset>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-[14px] border border-dashed border-line p-6 text-ink/70">{children}</p>;
}

export function ErrorState({ children }: { children: ReactNode }) {
  return <p className="rounded-[14px] border border-terracotta bg-terracotta/10 p-4 text-terracotta">{children}</p>;
}

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const key = `status.${status}`;
  const label = t(key);
  return (
    <span className="inline-flex min-h-8 items-center rounded-full bg-fond px-3 text-sm">
      {label === key ? status : label}
    </span>
  );
}

export function StationTag({ kind }: { kind: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex min-h-8 items-center rounded-full px-3 text-sm text-white",
        kind === "BAR" ? "bg-bar" : "bg-terracotta",
      )}
    >
      {t(`status.${kind}`)}
    </span>
  );
}

export function CopyButton({ value }: { value: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? t("admin.copied") : t("admin.copy")}
    </Button>
  );
}

export function ConfirmDialog({
  open,
  title,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())} title={title}>
      <div className="flex gap-2">
        <Button intent="danger" onClick={onConfirm}>
          {t("common.confirm")}
        </Button>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
      </div>
    </Dialog>
  );
}

export function ReasonDialog({
  open,
  onConfirm,
  onClose,
}: {
  open: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())} title={t("admin.reason")}>
      <label className="grid gap-2">
        <span>{t("admin.reasonHint")}</span>
        <textarea className={fieldClass} value={reason} onChange={(event) => setReason(event.target.value)} />
      </label>
      <div className="mt-3 flex gap-2">
        <Button intent="primary" disabled={reason.trim().length < 3} onClick={() => onConfirm(reason.trim())}>
          {t("common.confirm")}
        </Button>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
      </div>
    </Dialog>
  );
}

export function DataTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-[14px] border border-line">
      <table className="w-full border-collapse text-start">{children}</table>
    </div>
  );
}
