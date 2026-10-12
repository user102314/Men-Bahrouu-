import type { PublicOrder } from "@resto/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { CancellationInbox } from "../../components/admin/CancellationInbox.js";
import { DataTable, EmptyState, ErrorState, PageHeader, StatusBadge } from "../../components/admin/widgets.js";
import { Money } from "../../components/Money.js";
import { Button } from "../../components/ui/button.js";
import { adminApi } from "../../lib/admin-api.js";
import { api } from "../../lib/api.js";
import { hubErrorText } from "../../lib/errors.js";

const FILTERS = ["", "DRAFT", "SENT", "SERVED", "PAID", "CANCELLED"] as const;

function OrderLines({
  order,
  locale,
  onReprint,
  onClose,
  reprintError,
}: {
  order: PublicOrder;
  locale: "ar" | "fr";
  onReprint: (orderId: string) => void;
  onClose: () => void;
  reprintError: string | null;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-2xl">
          #{order.dailyNumber} · {order.serverName}
        </h2>
        <StatusBadge status={order.status} />
      </div>
      {order.note ? <p>{order.note}</p> : null}
      <ul className="grid gap-1">
        {order.items.map((item) => (
          <li key={item.id} className="flex min-h-11 flex-wrap items-center justify-between gap-2">
            <span className={item.status === "VOIDED" ? "line-through opacity-60" : ""}>
              {item.quantity} × {item.productNameSnapshot}
              {item.note ? ` · ${item.note}` : ""}
            </span>
            <span className="flex items-center gap-2">
              <Money millimes={item.unitPriceMillimes * item.quantity} locale={locale} />
              <StatusBadge status={item.status} />
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xl">
        <Money millimes={order.totalMillimes} locale={locale} />
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => onReprint(order.id)}>{t("cashier.reprint")}</Button>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
      </div>
      {reprintError ? <ErrorState>{reprintError}</ErrorState> : null}
    </>
  );
}

export function OrdersPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith("ar") ? "ar" : "fr";
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<(typeof FILTERS)[number]>("");
  const [selected, setSelected] = useState<string | null>(null);
  const detailPanel = useRef<HTMLElement>(null);
  const list = useQuery({
    queryKey: ["admin", "orders", status],
    queryFn: () => adminApi.orders(status || undefined),
  });
  const detail = useQuery({
    queryKey: ["order", selected],
    queryFn: () => api.order(selected ?? ""),
    enabled: selected !== null,
  });
  const pending = useQuery({ queryKey: ["cancellations"], queryFn: () => api.cancellations() });
  const decide = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => api.decideCancellation(id, approve),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["cancellations"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
      await queryClient.invalidateQueries({ queryKey: ["order"] });
    },
  });
  const reprint = useMutation({
    mutationFn: (orderId: string) => api.reprint(orderId),
  });
  useEffect(() => {
    detailPanel.current?.scrollIntoView({ block: "nearest" });
  }, [selected, detail.data]);

  return (
    <div className="grid gap-4">
      <PageHeader title={t("admin.orders")}>
        <select
          className="min-h-12 rounded-[12px] border border-line bg-fond px-3"
          value={status}
          onChange={(event) => setStatus(event.target.value as (typeof FILTERS)[number])}
        >
          {FILTERS.map((item) => (
            <option key={item || "all"} value={item}>
              {item ? t(`status.${item}`) : t("admin.live")}
            </option>
          ))}
        </select>
      </PageHeader>
      {list.error ? <ErrorState>{hubErrorText(list.error, t)}</ErrorState> : null}
      {selected ? (
        <section ref={detailPanel} className="grid gap-2 rounded-[14px] border border-line bg-surface p-4">
          {detail.isPending ? <p>{t("common.loading")}</p> : null}
          {detail.error ? <ErrorState>{hubErrorText(detail.error, t)}</ErrorState> : null}
          {detail.data ? (
            <OrderLines
              order={detail.data.order}
              locale={locale}
              onReprint={(orderId) => reprint.mutate(orderId)}
              onClose={() => setSelected(null)}
              reprintError={reprint.error ? hubErrorText(reprint.error, t) : null}
            />
          ) : null}
        </section>
      ) : null}
      {list.data && list.data.orders.length === 0 ? <EmptyState>{t("admin.empty")}</EmptyState> : null}
      {list.data && list.data.orders.length > 0 ? (
        <DataTable>
          <tbody>
            {list.data.orders.map((order) => (
              <tr key={order.id} className="border-t border-line">
                <td className="p-3">{order.dailyNumber}</td>
                <td className="p-3">{order.serverName}</td>
                <td className="p-3">
                  <StatusBadge status={order.status} />
                </td>
                <td className="p-3">
                  <Money millimes={order.totalMillimes} locale={locale} />
                </td>
                <td className="p-3">
                  <Button
                    intent={selected === order.id ? "primary" : "quiet"}
                    onClick={() => setSelected(selected === order.id ? null : order.id)}
                  >
                    {t("cashier.detail")}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      ) : null}
      {list.data?.nextCursor ? <p className="text-sm">{t("admin.moreRows")}</p> : null}
      <section className="grid gap-3">
        <h2 className="font-display text-2xl">{t("cashier.inbox")}</h2>
        <CancellationInbox
          rows={pending.data?.cancellations ?? []}
          onDecide={(id, approve) => decide.mutate({ id, approve })}
        />
        {decide.error ? <ErrorState>{hubErrorText(decide.error, t)}</ErrorState> : null}
      </section>
    </div>
  );
}
