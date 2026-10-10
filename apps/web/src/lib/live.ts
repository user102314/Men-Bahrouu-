import { publicOrderSchema, tableRealtimeSchema, type PublicOrder } from "@resto/shared";
import type { QueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";

import type { OrderDetail, OrderList } from "./api.js";
import { hubUrl } from "./hub-url.js";

export type LinkState = "connected" | "reconnecting" | "unreachable";

let socket: Socket | null = null;

function upsert(list: OrderList, order: PublicOrder): OrderList {
  const exists = list.orders.some((item) => item.id === order.id);
  return {
    ...list,
    orders: exists
      ? list.orders.map((item) => (item.id === order.id ? order : item))
      : [order, ...list.orders],
  };
}

export function connectLive(
  token: string,
  queryClient: QueryClient,
  onLink: (state: LinkState) => void,
): () => void {
  socket?.disconnect();
  const next = io(hubUrl(), {
    auth: { token },
    autoConnect: true,
    reconnection: true,
  });
  socket = next;
  next.on("connect", () => onLink("connected"));
  next.on("disconnect", () => onLink("reconnecting"));
  next.on("connect_error", () => onLink("unreachable"));
  next.onAny((event, payload: unknown) => {
    if (typeof event !== "string") {
      return;
    }
    if (event === "table.updated") {
      if (!tableRealtimeSchema.safeParse(payload).success) {
        void queryClient.invalidateQueries({ queryKey: ["tables"] });
      }
      void queryClient.invalidateQueries({ queryKey: ["tables"] });
      return;
    }
    if (event === "catalog.updated") {
      void queryClient.invalidateQueries({ queryKey: ["catalog"] });
      return;
    }
    if (event === "print.job.updated" || event === "print.failed") {
      void queryClient.invalidateQueries({ queryKey: ["print-jobs"] });
      void queryClient.invalidateQueries({ queryKey: ["printers"] });
      return;
    }
    const record = payload && typeof payload === "object" ? payload : null;
    const order = record && "order" in record ? publicOrderSchema.safeParse(record.order) : null;
    if (order?.success) {
      queryClient.setQueryData<OrderList>(["orders"], (current) =>
        current ? upsert(current, order.data) : current,
      );
      queryClient.setQueryData<OrderDetail>(["order", order.data.id], (current) =>
        current ? { ...current, order: order.data } : current,
      );
      if (event.startsWith("cancellation.")) {
        void queryClient.invalidateQueries({ queryKey: ["cancellations"] });
        void queryClient.invalidateQueries({ queryKey: ["order", order.data.id] });
      }
      return;
    }
    if (event.startsWith("order.") || event.startsWith("cancellation.")) {
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      void queryClient.invalidateQueries({ queryKey: ["order"] });
      void queryClient.invalidateQueries({ queryKey: ["tables"] });
      void queryClient.invalidateQueries({ queryKey: ["cancellations"] });
    }
  });
  return () => {
    next.disconnect();
    if (socket === next) {
      socket = null;
    }
  };
}
