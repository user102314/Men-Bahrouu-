import { newId, type PublicOrder } from "@resto/shared";
import { useQuery } from "@tanstack/react-query";
import { Armchair, ChefHat, GlassWater, Receipt, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Money } from "../components/Money.js";
import { TicketPanel, type TicketLineView } from "../components/TicketPanel.js";
import { useLink } from "../components/HubLink.js";
import { Button } from "../components/ui/button.js";
import { Dialog } from "../components/ui/dialog.js";
import { api, HubError, type Catalog, type FloorTable, type OrderDetail } from "../lib/api.js";
import { clearDraft, readDraft, saveDraft } from "../lib/draft.js";
import { hubErrorText } from "../lib/errors.js";
import { queryClient } from "../lib/query.js";
import { routingPreview, type StationKind } from "../lib/routing.js";
import { minutesSince, tunisTime } from "../lib/time.js";

const NOTE_PRESETS = [
  { id: "noSalt", fr: "sans sel" },
  { id: "wellDone", fr: "bien cuit" },
  { id: "noIce", fr: "sans glace" },
  { id: "noChili", fr: "sans piment" },
] as const;

function kindFor(catalog: Catalog | undefined, productId: string): StationKind {
  for (const category of catalog?.categories ?? []) {
    if (category.products.some((product) => product.id === productId)) {
      return category.stationKind;
    }
  }
  return "KITCHEN";
}

function statusClass(status: FloorTable["status"]): string {
  if (status === "FREE") {
    return "border-olive text-olive";
  }
  if (status === "TO_PAY") {
    return "border-accent text-accent";
  }
  return "border-primary text-primary";
}

export function WaiterPage() {
  const { t, i18n } = useTranslation();
  const link = useLink();
  const blocked = link === "unreachable";
  const locale = i18n.language.startsWith("ar") ? "ar" : "fr";
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: api.catalog });
  const tables = useQuery({ queryKey: ["tables"], queryFn: api.tables });
  const orders = useQuery({ queryKey: ["orders"], queryFn: () => api.orders() });
  const [selection, setSelection] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const detail = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => api.order(orderId ?? ""),
    enabled: Boolean(orderId),
  });
  const [tab, setTab] = useState<"floor" | "ticket" | "mine">("floor");
  const [categoryId, setCategoryId] = useState("all");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [noteItem, setNoteItem] = useState<string | null>(null);
  const [cancelItem, setCancelItem] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (detail.error instanceof HubError && detail.error.code === "NOT_FOUND" && selection) {
      clearDraft(selection);
      setOrderId(null);
    }
  }, [detail.error, selection]);

  const order = detail.data?.order ?? null;
  const draftKey = selection ?? "takeaway";

  function remember(next: PublicOrder): void {
    setOrderId(next.id);
    queryClient.setQueryData<OrderDetail>(["order", next.id], (current) => ({
      order: next,
      cancellations: current?.cancellations ?? [],
    }));
    void queryClient.invalidateQueries({ queryKey: ["orders"] });
    void queryClient.invalidateQueries({ queryKey: ["tables"] });
  }

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage(hubErrorText(error, t));
    } finally {
      setBusy(false);
    }
  }

  function openTable(table: FloorTable): void {
    if (table.status !== "FREE" && !table.ownedByMe) {
      setMessage(t("waiter.other"));
      return;
    }
    setMessage(null);
    setSelection(table.id);
    setOrderId(table.openOrderId ?? readDraft(table.id));
    setTab("ticket");
  }

  async function addProduct(productId: string): Promise<void> {
    if (!selection || (orderId !== null && order === null && !detail.isError)) {
      return;
    }
    const closed = order?.status === "PAID" || order?.status === "CANCELLED";
    await run(async () => {
      if (!order || closed) {
        const id = closed ? newId() : (readDraft(draftKey) ?? newId());
        saveDraft(draftKey, id);
        const created = await api.createOrder({
          id,
          ...(selection === "takeaway" ? {} : { tableId: selection }),
          items: [{ productId, quantity: 1 }],
        });
        remember(created);
        return;
      }
      remember(await api.addItems(order.id, [{ productId, quantity: 1 }]));
    });
  }

  const lines: TicketLineView[] = (order?.items ?? []).map((item) => ({
    id: item.id,
    name: item.productNameSnapshot,
    quantity: item.quantity,
    note: item.note,
    sent: item.sentAt !== null,
    sentAt: item.sentAt,
    voided: item.status === "VOIDED",
    pendingCancel:
      detail.data?.cancellations.some(
        (cancellation) => cancellation.orderItemId === item.id && cancellation.status === "PENDING",
      ) ?? false,
  }));
  const preview = routingPreview(
    (order?.items ?? [])
      .filter((item) => item.status === "ACTIVE")
      .map((item) => ({
        quantity: item.quantity,
        stationKind: kindFor(catalog.data, item.productId),
        sent: item.sentAt !== null,
      })),
  );
  const zones = new Map<string, FloorTable[]>();
  for (const table of tables.data?.tables ?? []) {
    const list = zones.get(table.zone) ?? [];
    list.push(table);
    zones.set(table.zone, list);
  }
  const needle = search.trim().toLowerCase();
  const categories = catalog.data?.categories ?? [];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        {(["floor", "ticket", "mine"] as const).map((item) => (
          <Button key={item} intent={tab === item ? "primary" : "quiet"} onClick={() => setTab(item)}>
            {t(`waiter.${item}`)}
          </Button>
        ))}
      </div>
      {message ? <p role="status">{message}</p> : null}
      {tab === "floor" ? (
        <div className="grid gap-4">
          <Button
            intent="accent"
            onClick={() => {
              setSelection("takeaway");
              setOrderId(readDraft("takeaway"));
              setTab("ticket");
            }}
          >
            {t("waiter.takeaway")}
          </Button>
          {[...zones.entries()].map(([zone, zoneTables]) => (
            <section key={zone} className="grid gap-3">
              <h2 className="text-2xl">{zone}</h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
                {zoneTables.map((table) => (
                  <button
                    key={table.id}
                    type="button"
                    className={`min-h-28 rounded-[14px] border-2 bg-surface p-3 text-start ${statusClass(table.status)}`}
                    onClick={() => openTable(table)}
                  >
                    <span className="flex items-center gap-2 text-2xl font-medium">
                      {table.status === "FREE" ? <Armchair aria-hidden /> : null}
                      {table.status === "OCCUPIED" ? <Users aria-hidden /> : null}
                      {table.status === "TO_PAY" ? <Receipt aria-hidden /> : null}
                      {table.label}
                    </span>
                    <span className="mt-1 block text-sm">
                      {t(`status.${table.status}`)} · {t("waiter.seats", { count: table.seats })}
                    </span>
                    {table.occupiedSince ? (
                      <span className="block text-sm tabular-nums">
                        {t("waiter.minutes", { count: minutesSince(table.occupiedSince) })}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}
      {tab === "ticket" ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="grid gap-3">
            <label className="grid gap-2">
              {t("common.search")}
              <input
                className="min-h-12 rounded-[12px] border border-line bg-surface px-3"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button intent={categoryId === "all" ? "primary" : "quiet"} onClick={() => setCategoryId("all")}>
                {t("waiter.all")}
              </Button>
              {categories.map((category) => (
                <Button
                  key={category.id}
                  intent={categoryId === category.id ? "primary" : "quiet"}
                  onClick={() => setCategoryId(category.id)}
                >
                  {category.stationKind === "BAR" ? <GlassWater aria-hidden /> : <ChefHat aria-hidden />}
                  {locale === "ar" ? category.nameAr : category.nameFr}
                  <span className={category.stationKind === "BAR" ? "text-bar" : "text-terracotta"}>
                    {t(`status.${category.stationKind}`)}
                  </span>
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
              {categories
                .filter((category) => categoryId === "all" || category.id === categoryId)
                .flatMap((category) => category.products)
                .filter((product) => {
                  if (needle.length === 0) {
                    return true;
                  }
                  return (
                    product.nameFr.toLowerCase().includes(needle) ||
                    product.nameAr.toLowerCase().includes(needle)
                  );
                })
                .map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    disabled={!product.isAvailable || blocked || busy || !selection}
                    className="min-h-28 rounded-[14px] border border-line bg-surface p-3 text-start disabled:opacity-50"
                    onClick={() => void addProduct(product.id)}
                  >
                    <span className="block text-lg">
                      {locale === "ar" ? product.nameAr : product.nameFr}
                    </span>
                    <Money millimes={product.priceMillimes} locale={locale} />
                    {product.isAvailable ? null : (
                      <span className="mt-1 block text-sm">{t("waiter.exhausted")}</span>
                    )}
                  </button>
                ))}
            </div>
          </section>
          <aside className="grid gap-3 rounded-[14px] border border-line bg-surface p-4">
            <h2 className="text-2xl">{t("waiter.ticket")}</h2>
            <TicketPanel
              lines={lines}
              disabled={blocked || busy}
              labels={{
                decrease: t("waiter.decrease"),
                increase: t("waiter.increase"),
                remove: t("waiter.remove"),
                note: t("waiter.note"),
                cancel: t("waiter.cancelLine"),
                locked: t("waiter.locked"),
                pending: t("waiter.pending"),
                empty: t("waiter.emptyTicket"),
              }}
              onQuantity={(id, quantity) => {
                if (!order) {
                  return;
                }
                void run(async () => remember(await api.updateItem(order.id, id, { quantity })));
              }}
              onRemove={(id) => {
                if (!order) {
                  return;
                }
                void run(async () => remember(await api.deleteItem(order.id, id)));
              }}
              onNote={setNoteItem}
              onCancel={setCancelItem}
            />
            <p>
              {t("waiter.total")}{" "}
              <Money millimes={order?.totalMillimes ?? 0} locale={locale} />
            </p>
            <Button intent="primary" disabled={blocked || busy || preview.bar + preview.kitchen === 0} onClick={() => setSendOpen(true)}>
              {t("waiter.send")}
            </Button>
            <Button
              disabled={blocked || busy || !order || order.tableId === null || order.status === "DRAFT"}
              onClick={() => {
                if (!order) {
                  return;
                }
                void run(async () => {
                  remember(await api.requestBill(order.id));
                  setMessage(t("waiter.bill"));
                });
              }}
            >
              {t("waiter.bill")}
            </Button>
          </aside>
        </div>
      ) : null}
      {tab === "mine" ? (
        <ul className="grid gap-3">
          {(orders.data?.orders ?? []).length === 0 ? <li>{t("waiter.emptyOrders")}</li> : null}
          {(orders.data?.orders ?? []).map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="flex min-h-16 w-full items-center justify-between rounded-[14px] border border-line bg-surface px-4 text-start"
                onClick={() => {
                  setOrderId(item.id);
                  setSelection(item.tableId ?? "takeaway");
                  setTab("ticket");
                }}
              >
                <span>
                  {tables.data?.tables.find((table) => table.id === item.tableId)?.label ??
                    t("waiter.takeaway")}{" "}
                  · {t(`status.${item.status}`)} · {tunisTime(item.openedAt)}
                </span>
                <Money millimes={item.totalMillimes} locale={locale} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Dialog open={sendOpen} onOpenChange={setSendOpen} title={t("waiter.confirmSend")}>
        <p>{t("waiter.routeBar", { count: preview.bar })}</p>
        <p>{t("waiter.routeKitchen", { count: preview.kitchen })}</p>
        <Button
          className="mt-4"
          intent="primary"
          disabled={blocked || busy}
          onClick={() => {
            if (!order) {
              return;
            }
            void run(async () => {
              remember(await api.send(order.id));
              setSendOpen(false);
              setMessage(t("waiter.sent"));
            });
          }}
        >
          {t("waiter.send")}
        </Button>
      </Dialog>
      <Dialog open={noteItem !== null} onOpenChange={(open) => !open && setNoteItem(null)} title={t("waiter.note")}>
        <div className="flex flex-wrap gap-2">
          {NOTE_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              onClick={() => {
                if (!order || !noteItem) {
                  return;
                }
                const itemId = noteItem;
                void run(async () => {
                  remember(await api.updateItem(order.id, itemId, { note: preset.fr }));
                  setNoteItem(null);
                });
              }}
            >
              {t(`notes.${preset.id}`)}
            </Button>
          ))}
        </div>
      </Dialog>
      <Dialog
        open={cancelItem !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCancelItem(null);
            setReason("");
          }
        }}
        title={t("waiter.cancelLine")}
      >
        <label className="grid gap-2">
          {t("waiter.reason")}
          <input
            className="min-h-12 rounded-[12px] border border-line bg-fond px-3"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <Button
          className="mt-4"
          intent="danger"
          disabled={blocked || busy || reason.trim().length < 3 || !order || !cancelItem}
          onClick={() => {
            if (!order || !cancelItem) {
              return;
            }
            const itemId = cancelItem;
            void run(async () => {
              await api.requestCancellation(order.id, itemId, reason.trim());
              setCancelItem(null);
              setReason("");
              setMessage(t("waiter.pending"));
              void queryClient.invalidateQueries({ queryKey: ["order", order.id] });
            });
          }}
        >
          {t("waiter.cancelLine")}
        </Button>
      </Dialog>
    </div>
  );
}
