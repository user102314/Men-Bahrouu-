import { publicOrderSchema } from "@resto/shared";
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { z } from "zod";

import { text, type Lang } from "./copy.js";
import { decideCancellation, hubOrigin, pendingCancellations } from "./hub.js";
import type { FloorTable } from "./tables.js";

const sentSchema = z.object({
  order: publicOrderSchema,
});

const askedSchema = z.object({
  cancellation: z.object({
    id: z.uuid(),
    orderId: z.uuid(),
    orderItemId: z.uuid().nullable(),
    status: z.enum(["PENDING", "APPROVED", "REJECTED"]),
    reason: z.string(),
  }),
  order: publicOrderSchema,
});

interface OrderAlert {
  id: string;
  kind: "order";
  title: string;
  detail: string;
  note?: string;
}

interface CancelAlert {
  id: string;
  kind: "cancel";
  title: string;
  detail: string;
  note?: string;
}

type Alert = OrderAlert | CancelAlert;

export function FloorSignals({
  lang,
  role,
  tables,
  onDecision,
}: {
  lang: Lang;
  role: "WAITER" | "CASHIER";
  tables: FloorTable[];
  onDecision: (orderId: string, status: "APPROVED" | "REJECTED") => void;
}) {
  const copy = text(lang);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const tablesRef = useRef(tables);
  const decisionRef = useRef(onDecision);
  tablesRef.current = tables;
  decisionRef.current = onDecision;

  useEffect(() => {
    const unlock = () => {
      const ctx = new AudioContext();
      void ctx.resume().finally(() => void ctx.close());
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  useEffect(() => {
    if (role !== "CASHIER") {
      return;
    }
    let stop = false;
    void pendingCancellations()
      .then((body) => {
        if (stop) {
          return;
        }
        setAlerts((current) => {
          const known = new Set(current.map((alert) => alert.id));
          const next = body.cancellations
            .filter((item) => !known.has(item.id))
            .map((item) => cancelAlert(item.id, item.tableLabel, item.productName, item.serverName, item.reason, copy.cancelAlert));
          return [...next, ...current];
        });
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, [role, lang]);

  useEffect(() => {
    const session = sessionToken();
    if (!session) {
      return;
    }
    const socket = io(hubOrigin(), { auth: { token: session }, transports: ["websocket"] });
    socket.on("order.sent", (payload: unknown) => {
      if (role !== "CASHIER") {
        return;
      }
      const parsed = sentSchema.safeParse(payload);
      if (!parsed.success) {
        return;
      }
      const order = parsed.data.order;
      const table = tablesRef.current.find((item) => item.id === order.tableId);
      const names = order.items
        .filter((item) => item.status === "ACTIVE")
        .slice(0, 3)
        .map((item) => `${item.quantity}× ${item.productNameSnapshot}`)
        .join(", ");
      chime(2);
      setAlerts((current) => [
        {
          id: order.id,
          kind: "order",
          title: copy.orderAlert,
          detail: `${table?.label ?? order.dailyNumber} · ${order.serverName}${names ? ` · ${names}` : ""}`,
        },
        ...current.filter((alert) => alert.id !== order.id),
      ]);
    });
    socket.on("cancellation.requested", (payload: unknown) => {
      if (role !== "CASHIER") {
        return;
      }
      const parsed = askedSchema.safeParse(payload);
      if (!parsed.success || parsed.data.cancellation.status !== "PENDING") {
        return;
      }
      const { cancellation, order } = parsed.data;
      const table = tablesRef.current.find((item) => item.id === order.tableId);
      const line = order.items.find((item) => item.id === cancellation.orderItemId);
      chime(3);
      setAlerts((current) => [
        cancelAlert(
          cancellation.id,
          table?.label ?? String(order.dailyNumber),
          line?.productNameSnapshot ?? "",
          order.serverName,
          cancellation.reason,
          copy.cancelAlert,
        ),
        ...current.filter((alert) => alert.id !== cancellation.id),
      ]);
    });
    socket.on("cancellation.decided", (payload: unknown) => {
      const parsed = askedSchema.safeParse(payload);
      if (!parsed.success || parsed.data.cancellation.status === "PENDING") {
        return;
      }
      setAlerts((current) => current.filter((alert) => alert.id !== parsed.data.cancellation.id));
      decisionRef.current(parsed.data.cancellation.orderId, parsed.data.cancellation.status);
    });
    return () => {
      socket.close();
    };
  }, [role, lang]);

  function failDecision(id: string, error: unknown, alreadyPaid: string, failed: string) {
    const code = error instanceof Error ? error.message : "";
    const note = code === "ALREADY_PAID" ? alreadyPaid : failed;
    setAlerts((current) => current.map((item) => (item.id === id ? { ...item, note } : item)));
  }

  if (role !== "CASHIER" || alerts.length === 0) {
    return null;
  }

  return (
    <div className="floor-alerts">
      {alerts.map((alert) => (
        <article key={alert.id} className={alert.kind === "order" ? "bg-primary text-white" : "bg-[#8a2e1d] text-white"}>
          <p className="text-sm font-semibold">{alert.title}</p>
          <p>{alert.detail}</p>
          {alert.note ? <p className="font-semibold">{alert.note}</p> : null}
          {alert.kind === "order" ? (
            <button type="button" className="min-h-12 rounded-md bg-olive px-3 font-semibold text-white" onClick={() => setAlerts((current) => current.filter((item) => item.id !== alert.id))}>
              {copy.seen}
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                className="min-h-12 flex-1 rounded-md bg-olive font-semibold text-white disabled:opacity-40"
                disabled={busyId === alert.id}
                onClick={() => {
                  setBusyId(alert.id);
                  void decideCancellation(alert.id, true)
                    .then(() => setAlerts((current) => current.filter((item) => item.id !== alert.id)))
                    .catch((error: unknown) => failDecision(alert.id, error, copy.alreadyPaid, copy.payFailed))
                    .finally(() => setBusyId(null));
                }}
              >
                {copy.acceptCancel}
              </button>
              <button
                type="button"
                className="min-h-12 flex-1 rounded-md bg-terracotta font-semibold text-white disabled:opacity-40"
                disabled={busyId === alert.id}
                onClick={() => {
                  setBusyId(alert.id);
                  void decideCancellation(alert.id, false)
                    .then(() => setAlerts((current) => current.filter((item) => item.id !== alert.id)))
                    .catch((error: unknown) => failDecision(alert.id, error, copy.alreadyPaid, copy.payFailed))
                    .finally(() => setBusyId(null));
                }}
              >
                {copy.refuseCancel}
              </button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function cancelAlert(id: string, table: string, product: string, server: string, reason: string, title: string): CancelAlert {
  return {
    id,
    kind: "cancel",
    title,
    detail: [table, product, server, reason].filter((part) => part.length > 0).join(" · "),
  };
}

function sessionToken(): string | null {
  try {
    const raw = sessionStorage.getItem("resto.floor");
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { token?: string };
    return typeof parsed.token === "string" ? parsed.token : null;
  } catch {
    return null;
  }
}

function chime(times: number) {
  const Ctx = window.AudioContext;
  if (!Ctx) {
    return;
  }
  const ctx = new Ctx();
  for (let index = 0; index < times; index += 1) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = index % 2 === 0 ? 880 : 660;
    gain.gain.value = 0.07;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const start = ctx.currentTime + index * 0.22;
    osc.start(start);
    osc.stop(start + 0.16);
  }
  window.setTimeout(() => void ctx.close(), times * 280);
}
