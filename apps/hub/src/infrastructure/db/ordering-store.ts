import {
  businessDate,
  newId,
  ticketPayloadSchema,
  type CancellationStatus,
  type CreateOrderInput,
  type OrderItemStatus,
  type OrderStatus,
  type PrintJobStatus,
  type PrintJobType,
  type PublicOrder,
  type PublicOrderItem,
  type Role,
  type StationKind,
  type TableStatus,
  type TicketPayload,
  type UpdateOrderItemInput,
} from "@resto/shared";
import type postgres from "postgres";

import { DomainError } from "../../domain/ordering/errors.js";
import {
  assertCanAddItems,
  assertCanEditUnsent,
  assertCanViewOrder,
  statusAfterActiveCount,
  statusAfterSend,
  statusAfterServed,
} from "../../domain/ordering/rules.js";
import { activeTotal } from "../../domain/ordering/totals.js";
import { routeByStation } from "../../domain/printing/print-router.js";
import { allocateDailyNumber } from "./order-counter.js";

type Tx = postgres.TransactionSql<Record<string, never>>;

export interface Actor {
  id: string;
  role: Role;
  deviceId: string | null;
}

export interface OrderMutation {
  order: PublicOrder;
  events: RealtimeMessage[];
  created: boolean;
}

export type RealtimeMessage =
  | {
      name: "order.created" | "order.updated" | "order.sent";
      serverId: string;
      payload: { version: number; order: PublicOrder };
    }
  | {
      name: "table.updated";
      serverId: string;
      payload: {
        version: number;
        table: {
          id: string;
          label: string;
          zone: string;
          seats: number;
          status: TableStatus;
          openOrderId: string | null;
        };
      };
    }
  | {
      name: "cancellation.requested" | "cancellation.decided";
      serverId: string;
      payload: {
        version: number;
        serverId: string;
        cancellation: {
          id: string;
          orderId: string;
          orderItemId: string | null;
          status: CancellationStatus;
          reason: string;
        };
        order: PublicOrder;
      };
    };

interface Header {
  id: string;
  tableId: string | null;
  serverId: string;
  serverName: string;
  status: OrderStatus;
  businessDate: string;
  dailyNumber: number;
  note: string | null;
  totalMillimes: number;
  version: number;
  openedAt: string;
  sentAt: string | null;
  closedAt: string | null;
}

interface Item extends PublicOrderItem {
  nameAr: string;
  stationKind: StationKind;
  printerId: string;
}

interface RequestedLine {
  productId: string;
  quantity: number;
  note?: string | undefined;
}

export interface OrderingStore {
  catalog(): Promise<unknown>;
  tables(actor: Actor): Promise<unknown>;
  create(actor: Actor, input: CreateOrderInput, now: Date): Promise<OrderMutation>;
  list(
    actor: Actor,
    filter: {
      status?: OrderStatus;
      tableId?: string;
      mine: boolean;
      cursor?: string;
      limit: number;
    },
  ): Promise<{ orders: PublicOrder[]; nextCursor: string | null }>;
  get(actor: Actor, orderId: string, includePrintJobs: boolean): Promise<unknown>;
  addItems(
    actor: Actor,
    orderId: string,
    lines: RequestedLine[],
    now: Date,
  ): Promise<OrderMutation>;
  updateItem(
    actor: Actor,
    orderId: string,
    itemId: string,
    input: UpdateOrderItemInput,
    now: Date,
  ): Promise<OrderMutation>;
  deleteItem(actor: Actor, orderId: string, itemId: string, now: Date): Promise<OrderMutation>;
  send(actor: Actor, orderId: string, now: Date): Promise<OrderMutation>;
  markServed(actor: Actor, orderId: string): Promise<OrderMutation>;
  requestCancellation(
    actor: Actor,
    orderId: string,
    orderItemId: string | null,
    reason: string,
  ): Promise<OrderMutation & { cancellationId: string }>;
  decideCancellation(
    actor: Actor,
    cancellationId: string,
    approve: boolean,
    overrideBy: string | null,
    now: Date,
  ): Promise<OrderMutation>;
  listCancellations(status: CancellationStatus): Promise<unknown>;
}

export function createOrderingStore(
  sql: postgres.Sql,
  options: { siteId: string; cutoffHour: number },
): OrderingStore {
  return {
    catalog: () => catalog(sql, options.siteId),
    tables: (actor) => listTables(sql, options.siteId, actor),
    create: (actor, input, now) => createOrder(sql, options, actor, input, now),
    list: (actor, filter) => listOrders(sql, options.siteId, actor, filter),
    get: (actor, orderId, includePrintJobs) =>
      getOrder(sql, options.siteId, actor, orderId, includePrintJobs),
    addItems: (actor, orderId, lines, now) =>
      mutate(sql, (tx) => addItems(tx, options.siteId, actor, orderId, lines, now)),
    updateItem: (actor, orderId, itemId, input, now) =>
      mutate(sql, (tx) => updateItem(tx, options.siteId, actor, orderId, itemId, input, now)),
    deleteItem: (actor, orderId, itemId, now) =>
      mutate(sql, (tx) => deleteItem(tx, options.siteId, actor, orderId, itemId, now)),
    send: (actor, orderId, now) =>
      mutate(sql, (tx) => sendWithin(tx, options.siteId, actor, orderId, now)),
    markServed: (actor, orderId) =>
      mutate(sql, (tx) => markServed(tx, options.siteId, actor, orderId)),
    requestCancellation: (actor, orderId, orderItemId, reason) =>
      mutate(sql, (tx) =>
        requestCancellation(tx, options.siteId, actor, orderId, orderItemId, reason),
      ),
    decideCancellation: (actor, cancellationId, approve, overrideBy, now) =>
      mutate(sql, (tx) =>
        decideCancellation(tx, options.siteId, actor, cancellationId, approve, overrideBy, now),
      ),
    listCancellations: (status) => listCancellations(sql, options.siteId, status),
  };
}

async function mutate<T>(sql: postgres.Sql, work: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return (await sql.begin(work)) as T;
  } catch (error) {
    if (uniqueConstraint(error) === "orders_one_open_per_table") {
      throw new DomainError("TABLE_BUSY");
    }
    throw error;
  }
}

async function createOrder(
  sql: postgres.Sql,
  options: { siteId: string; cutoffHour: number },
  actor: Actor,
  input: CreateOrderInput,
  now: Date,
): Promise<OrderMutation> {
  try {
    return await sql.begin((tx) => insertOrder(tx, options, actor, input, now));
  } catch (error) {
    if (uniqueConstraint(error) === "orders_one_open_per_table") {
      throw new DomainError("TABLE_BUSY");
    }
    if (uniqueConstraint(error) === "orders_pkey") {
      return replayCreate(sql, options.siteId, actor, input, now);
    }
    throw error;
  }
}

async function replayCreate(
  sql: postgres.Sql,
  siteId: string,
  actor: Actor,
  input: CreateOrderInput,
  now: Date,
): Promise<OrderMutation> {
  const rows = await sql<{ server_id: string }[]>`
    select server_id from orders where id = ${input.id} and site_id = ${siteId}
  `;
  const existing = rows[0];
  if (!existing || existing.server_id !== actor.id) {
    throw new DomainError("ORDER_ID_CONFLICT");
  }
  if (!input.sendImmediately) {
    const order = await readOrder(sql, input.id);
    return { order, events: [], created: false };
  }
  const sent = await sql.begin((tx) => sendWithin(tx, siteId, actor, input.id, now));
  return { ...sent, created: false };
}

async function insertOrder(
  tx: Tx,
  options: { siteId: string; cutoffHour: number },
  actor: Actor,
  input: CreateOrderInput,
  now: Date,
): Promise<OrderMutation> {
  const existing = await tx<{ server_id: string }[]>`
    select server_id from orders where id = ${input.id}
  `;
  const found = existing[0];
  if (found) {
    if (found.server_id !== actor.id) {
      throw new DomainError("ORDER_ID_CONFLICT");
    }
    if (!input.sendImmediately) {
      return { order: await readOrder(tx, input.id), events: [], created: false };
    }
    const sent = await sendWithin(tx, options.siteId, actor, input.id, now);
    return { ...sent, created: false };
  }
  const tableId = input.tableId ?? null;
  if (tableId) {
    const tables = await tx<{ site_id: string }[]>`
      select site_id from floor_tables where id = ${tableId}
    `;
    const table = tables[0];
    if (!table || table.site_id !== options.siteId) {
      throw new DomainError("NOT_FOUND");
    }
  }
  const date = businessDate(now, options.cutoffHour);
  const dailyNumber = await allocateDailyNumber(
    tx as unknown as postgres.Sql,
    options.siteId,
    date,
  );
  const resolved = await resolveProducts(tx, options.siteId, input.items);
  const total = activeTotal(resolved.map((line) => ({ ...line, status: "ACTIVE" as const })));
  const openedAt = now.toISOString();
  await tx`
    insert into orders (
      id, site_id, table_id, server_id, status, business_date, daily_number, note,
      total_millimes, version, opened_at
    ) values (
      ${input.id}, ${options.siteId}, ${tableId}, ${actor.id}, 'DRAFT', ${date}, ${dailyNumber},
      ${input.note ?? null}, ${total}, 1, ${openedAt}
    )
  `;
  await insertLines(tx, input.id, resolved);
  const draft = await readOrder(tx, input.id);
  await track(tx, options.siteId, actor, "order.created", "order", draft.id, null, draft);
  const events: RealtimeMessage[] = [orderEvent("order.created", draft)];
  if (!input.sendImmediately) {
    return { order: draft, events, created: true };
  }
  const sent = await sendWithin(tx, options.siteId, actor, input.id, now);
  return { order: sent.order, events: [...events, ...sent.events], created: true };
}

async function addItems(
  tx: Tx,
  siteId: string,
  actor: Actor,
  orderId: string,
  lines: RequestedLine[],
  _now: Date,
): Promise<OrderMutation> {
  const header = await lockHeader(tx, siteId, orderId, actor);
  assertCanAddItems(header.status);
  const resolved = await resolveProducts(tx, siteId, lines);
  await insertLines(tx, orderId, resolved);
  const order = await persistTotals(tx, header, _now);
  await track(tx, siteId, actor, "order.items.added", "order", order.id, null, order);
  return { order, events: [orderEvent("order.updated", order)], created: false };
}

async function updateItem(
  tx: Tx,
  siteId: string,
  actor: Actor,
  orderId: string,
  itemId: string,
  input: UpdateOrderItemInput,
  _now: Date,
): Promise<OrderMutation> {
  const header = await lockHeader(tx, siteId, orderId, actor);
  const item = await requireItem(tx, orderId, itemId);
  assertCanEditUnsent(header.serverId, actor.id, item.sentAt);
  await tx`
    update order_items
    set quantity = ${input.quantity ?? item.quantity},
        note = ${input.note === undefined ? item.note : input.note},
        updated_at = now()
    where id = ${itemId}
  `;
  const order = await persistTotals(tx, header, _now);
  await track(tx, siteId, actor, "order.item.updated", "order", order.id, null, order);
  return { order, events: [orderEvent("order.updated", order)], created: false };
}

async function deleteItem(
  tx: Tx,
  siteId: string,
  actor: Actor,
  orderId: string,
  itemId: string,
  now: Date,
): Promise<OrderMutation> {
  const header = await lockHeader(tx, siteId, orderId, actor);
  const item = await requireItem(tx, orderId, itemId);
  assertCanEditUnsent(header.serverId, actor.id, item.sentAt);
  await tx`
    update order_items
    set status = 'VOIDED', voided_at = ${now.toISOString()}, voided_by = ${actor.id}, updated_at = now()
    where id = ${itemId}
  `;
  const order = await persistTotals(tx, header, now);
  await track(tx, siteId, actor, "order.item.deleted", "order", order.id, null, order);
  const events: RealtimeMessage[] = [orderEvent("order.updated", order)];
  return { order, events, created: false };
}

async function sendWithin(
  tx: Tx,
  siteId: string,
  actor: Actor,
  orderId: string,
  now: Date,
): Promise<OrderMutation> {
  const header = await lockHeader(tx, siteId, orderId, actor);
  const items = await readItems(tx, orderId);
  const unsent = items.filter((item) => item.status === "ACTIVE" && item.sentAt === null);
  const next = statusAfterSend(header.status, unsent.length);
  if (next === "UNCHANGED") {
    const order = await readOrder(tx, orderId);
    return { order, events: [], created: false };
  }
  const sentAt = now.toISOString();
  const ticketType: PrintJobType = header.sentAt === null ? "NEW" : "ADD";
  await tx`
    update order_items
    set sent_at = ${sentAt}, updated_at = now()
    where order_id = ${orderId} and status = 'ACTIVE' and sent_at is null
  `;
  await tx`
    update orders
    set status = 'SENT', sent_at = coalesce(sent_at, ${sentAt}), version = version + 1, updated_at = now()
    where id = ${orderId}
  `;
  const order = await readOrder(tx, orderId);
  const events: RealtimeMessage[] = [orderEvent("order.sent", order)];
  if (header.tableId) {
    events.push(await occupyTable(tx, siteId, actor, header.tableId, order));
  }
  await createTickets(tx, siteId, actor, order, unsent, ticketType, sentAt);
  await track(tx, siteId, actor, "order.sent", "order", order.id, { status: header.status }, order);
  return { order, events, created: false };
}

async function markServed(
  tx: Tx,
  siteId: string,
  actor: Actor,
  orderId: string,
): Promise<OrderMutation> {
  const header = await lockHeader(tx, siteId, orderId, actor);
  statusAfterServed(header.status);
  await tx`
    update orders set status = 'SERVED', version = version + 1, updated_at = now() where id = ${orderId}
  `;
  const order = await readOrder(tx, orderId);
  await track(
    tx,
    siteId,
    actor,
    "order.served",
    "order",
    order.id,
    { status: header.status },
    order,
  );
  return { order, events: [orderEvent("order.updated", order)], created: false };
}

async function requestCancellation(
  tx: Tx,
  siteId: string,
  actor: Actor,
  orderId: string,
  orderItemId: string | null,
  reason: string,
): Promise<OrderMutation & { cancellationId: string }> {
  const header = await lockHeader(tx, siteId, orderId, actor);
  if (header.status === "PAID" || header.status === "CANCELLED" || header.status === "DRAFT") {
    throw new DomainError("INVALID_TRANSITION");
  }
  if (orderItemId) {
    const item = await requireItem(tx, orderId, orderItemId);
    if (item.status !== "ACTIVE" || item.sentAt === null) {
      throw new DomainError("INVALID_TRANSITION");
    }
  }
  const pending = await tx<{ id: string }[]>`
    select id from cancellation_requests
    where order_id = ${orderId} and status = 'PENDING'
      and order_item_id is not distinct from ${orderItemId}
  `;
  if (pending.length > 0) {
    throw new DomainError("CANCELLATION_EXISTS");
  }
  const id = newId();
  await tx`
    insert into cancellation_requests (id, order_id, order_item_id, requested_by, reason, status)
    values (${id}, ${orderId}, ${orderItemId}, ${actor.id}, ${reason}, 'PENDING')
  `;
  await tx`update orders set version = version + 1, updated_at = now() where id = ${orderId}`;
  const order = await readOrder(tx, orderId);
  const payload = {
    version: order.version,
    serverId: order.serverId,
    cancellation: { id, orderId, orderItemId, status: "PENDING" as const, reason },
    order,
  };
  await track(
    tx,
    siteId,
    actor,
    "cancellation.requested",
    "cancellation_request",
    id,
    null,
    payload,
  );
  return {
    order,
    cancellationId: id,
    created: false,
    events: [{ name: "cancellation.requested", serverId: order.serverId, payload }],
  };
}

async function decideCancellation(
  tx: Tx,
  siteId: string,
  actor: Actor,
  cancellationId: string,
  approve: boolean,
  overrideBy: string | null,
  now: Date,
): Promise<OrderMutation> {
  const requests = await tx<
    {
      id: string;
      order_id: string;
      order_item_id: string | null;
      reason: string;
      status: CancellationStatus;
    }[]
  >`
    select id, order_id, order_item_id, reason, status
    from cancellation_requests where id = ${cancellationId} for update
  `;
  const request = requests[0];
  if (!request) {
    throw new DomainError("NOT_FOUND");
  }
  const header = await lockHeader(tx, siteId, request.order_id, actor);
  if (request.status !== "PENDING" || header.status === "PAID") {
    throw new DomainError("INVALID_TRANSITION");
  }
  const decidedAt = now.toISOString();
  if (!approve) {
    await tx`
      update cancellation_requests
      set status = 'REJECTED', decided_by = ${actor.id}, decided_at = ${decidedAt}
      where id = ${cancellationId}
    `;
    await tx`update orders set version = version + 1, updated_at = now() where id = ${header.id}`;
    const order = await readOrder(tx, header.id);
    const payload = cancellationPayload(
      order,
      request.id,
      request.order_item_id,
      "REJECTED",
      request.reason,
    );
    await track(
      tx,
      siteId,
      actor,
      "cancellation.decided",
      "cancellation_request",
      request.id,
      null,
      {
        ...payload,
        decidedBy: actor.id,
        overrideBy,
      },
    );
    return {
      order,
      created: false,
      events: [{ name: "cancellation.decided", serverId: order.serverId, payload }],
    };
  }
  const items = await readItems(tx, header.id);
  const targets = items.filter((item) => {
    if (item.status !== "ACTIVE") {
      return false;
    }
    return request.order_item_id === null || item.id === request.order_item_id;
  });
  if (request.order_item_id !== null && targets.length === 0) {
    throw new DomainError("INVALID_TRANSITION");
  }
  const targetIds = targets.map((item) => item.id);
  if (targetIds.length > 0) {
    await tx`
      update order_items
      set status = 'VOIDED', voided_at = ${decidedAt}, voided_by = ${actor.id}, updated_at = now()
      where id in ${tx(targetIds)}
    `;
  }
  const sentTargets = targets.filter((item) => item.sentAt !== null);
  await createTickets(
    tx,
    siteId,
    actor,
    { ...headerToPublic(header, items), id: header.id },
    sentTargets,
    "VOID",
    decidedAt,
  );
  await tx`
    update cancellation_requests
    set status = 'APPROVED', decided_by = ${actor.id}, decided_at = ${decidedAt}, override_by = ${overrideBy}
    where id = ${cancellationId}
  `;
  const order = await persistTotals(tx, header, now);
  const events: RealtimeMessage[] = [];
  if (order.status === "CANCELLED" && header.tableId) {
    events.push(await freeTable(tx, siteId, actor, header.tableId, order));
  }
  const payload = cancellationPayload(
    order,
    request.id,
    request.order_item_id,
    "APPROVED",
    request.reason,
  );
  await track(tx, siteId, actor, "cancellation.decided", "cancellation_request", request.id, null, {
    decidedBy: actor.id,
    overrideBy,
    orderId: order.id,
    status: order.status,
  });
  events.unshift({ name: "cancellation.decided", serverId: order.serverId, payload });
  events.push(orderEvent("order.updated", order));
  return { order, events, created: false };
}

async function occupyTable(
  tx: Tx,
  siteId: string,
  actor: Actor,
  tableId: string,
  order: PublicOrder,
): Promise<RealtimeMessage> {
  await tx`update floor_tables set status = 'OCCUPIED', updated_at = now() where id = ${tableId}`;
  const message = await tableEvent(tx, tableId, order, order.id);
  await track(tx, siteId, actor, "table.updated", "floor_table", tableId, null, message.payload);
  return message;
}

async function freeTable(
  tx: Tx,
  siteId: string,
  actor: Actor,
  tableId: string,
  order: PublicOrder,
): Promise<RealtimeMessage> {
  await tx`update floor_tables set status = 'FREE', updated_at = now() where id = ${tableId}`;
  const message = await tableEvent(tx, tableId, order, null);
  await track(tx, siteId, actor, "table.updated", "floor_table", tableId, null, message.payload);
  return message;
}

async function tableEvent(
  tx: Tx,
  tableId: string,
  order: PublicOrder,
  openOrderId: string | null,
): Promise<RealtimeMessage> {
  const rows = await tx<{ label: string; zone: string; seats: number; status: TableStatus }[]>`
    select label, zone, seats, status from floor_tables where id = ${tableId}
  `;
  const table = rows[0];
  if (!table) {
    throw new DomainError("NOT_FOUND");
  }
  return {
    name: "table.updated",
    serverId: order.serverId,
    payload: {
      version: order.version,
      table: {
        id: tableId,
        label: table.label,
        zone: table.zone,
        seats: table.seats,
        status: table.status,
        openOrderId,
      },
    },
  };
}

async function createTickets(
  tx: Tx,
  siteId: string,
  actor: Actor,
  order: PublicOrder,
  lines: Item[],
  type: PrintJobType,
  createdAtIso: string,
): Promise<void> {
  const groups = routeByStation(lines);
  if (groups.length === 0) {
    return;
  }
  const tableLabel = order.tableId === null ? null : await tableLabelOf(tx, order.tableId);
  for (const group of groups) {
    const sample = group.lines[0];
    if (!sample) {
      continue;
    }
    const payload: TicketPayload = ticketPayloadSchema.parse({
      type,
      stationKind: sample.stationKind,
      orderNumber: order.dailyNumber,
      tableLabel,
      serverName: order.serverName,
      createdAtIso,
      ...(order.note ? { orderNote: order.note } : {}),
      lines: group.lines.map((line) => ({
        quantity: line.quantity,
        nameFr: line.productNameSnapshot,
        ...(line.nameAr ? { nameAr: line.nameAr } : {}),
        ...(line.note ? { note: line.note } : {}),
      })),
    });
    const id = newId();
    await tx`
      insert into print_jobs (
        id, site_id, order_id, station_id, printer_id, type, status, payload, attempts
      ) values (
        ${id}, ${siteId}, ${order.id}, ${sample.stationId}, ${sample.printerId},
        ${type}::print_job_type, 'PENDING', ${tx.json(payload)}, 0
      )
    `;
    await track(tx, siteId, actor, "print.job.created", "print_job", id, null, {
      id,
      type,
      orderId: order.id,
    });
  }
}

async function tableLabelOf(tx: Tx, tableId: string): Promise<string> {
  const rows = await tx<{ label: string }[]>`select label from floor_tables where id = ${tableId}`;
  const row = rows[0];
  if (!row) {
    throw new DomainError("NOT_FOUND");
  }
  return row.label;
}

async function persistTotals(tx: Tx, header: Header, now: Date): Promise<PublicOrder> {
  const items = await readItems(tx, header.id);
  const total = activeTotal(items);
  const next = statusAfterActiveCount(
    header.status,
    items.filter((item) => item.status === "ACTIVE").length,
  );
  const closedAt = next === "CANCELLED" ? now.toISOString() : header.closedAt;
  await tx`
    update orders
    set total_millimes = ${total},
        status = ${next}::order_status,
        version = version + 1,
        closed_at = ${closedAt},
        updated_at = now()
    where id = ${header.id}
  `;
  return readOrder(tx, header.id);
}

async function lockHeader(tx: Tx, siteId: string, orderId: string, actor: Actor): Promise<Header> {
  const rows = await tx<HeaderRow[]>`
    select o.id, o.table_id, o.server_id, u.display_name as server_name, o.status, o.business_date,
           o.daily_number, o.note, o.total_millimes, o.version, o.opened_at, o.sent_at, o.closed_at, o.site_id
    from orders o
    join users u on u.id = o.server_id
    where o.id = ${orderId}
    for update of o
  `;
  const row = rows[0];
  if (!row || row.site_id !== siteId) {
    throw new DomainError("NOT_FOUND");
  }
  assertCanViewOrder(actor.role, row.server_id, actor.id);
  return mapHeader(row);
}

async function requireItem(tx: Tx, orderId: string, itemId: string): Promise<Item> {
  const items = await readItems(tx, orderId);
  const item = items.find((candidate) => candidate.id === itemId);
  if (!item) {
    throw new DomainError("NOT_FOUND");
  }
  return item;
}

async function readOrder(tx: Tx | postgres.Sql, orderId: string): Promise<PublicOrder> {
  const rows = await tx<HeaderRow[]>`
    select o.id, o.table_id, o.server_id, u.display_name as server_name, o.status, o.business_date,
           o.daily_number, o.note, o.total_millimes, o.version, o.opened_at, o.sent_at, o.closed_at, o.site_id
    from orders o
    join users u on u.id = o.server_id
    where o.id = ${orderId}
  `;
  const row = rows[0];
  if (!row) {
    throw new DomainError("NOT_FOUND");
  }
  const items = await readItems(tx, orderId);
  return { ...mapHeader(row), items: items.map(toPublicItem) };
}

function headerToPublic(header: Header, items: Item[]): PublicOrder {
  return { ...header, totalMillimes: activeTotal(items), items: items.map(toPublicItem) };
}

async function readItems(tx: Tx | postgres.Sql, orderId: string): Promise<Item[]> {
  const rows = await tx<ItemRow[]>`
    select i.id, i.product_id, i.product_name_snapshot, i.unit_price_millimes, i.quantity, i.note,
           i.station_id, i.status, i.sent_at, p.name_ar, s.kind as station_kind, s.printer_id
    from order_items i
    join products p on p.id = i.product_id
    join stations s on s.id = i.station_id
    where i.order_id = ${orderId}
    order by i.created_at, i.id
  `;
  return rows.map((row) => ({
    id: row.id,
    productId: row.product_id,
    productNameSnapshot: row.product_name_snapshot,
    unitPriceMillimes: row.unit_price_millimes,
    quantity: row.quantity,
    note: row.note,
    stationId: row.station_id,
    status: row.status,
    sentAt: iso(row.sent_at),
    nameAr: row.name_ar,
    stationKind: row.station_kind,
    printerId: row.printer_id,
  }));
}

async function resolveProducts(tx: Tx, siteId: string, lines: readonly RequestedLine[]) {
  const ids = [...new Set(lines.map((line) => line.productId))];
  const rows = await tx<ProductRow[]>`
    select p.id, p.site_id, p.name_fr, p.name_ar, p.price_millimes, p.is_available, c.station_id
    from products p
    join categories c on c.id = p.category_id
    where p.id in ${tx(ids)}
  `;
  const byId = new Map(rows.map((row) => [row.id, row]));
  return lines.map((line) => {
    const product = byId.get(line.productId);
    if (!product || product.site_id !== siteId || !product.is_available) {
      throw new DomainError("PRODUCT_UNAVAILABLE");
    }
    return {
      productId: product.id,
      quantity: line.quantity,
      note: line.note ?? null,
      nameFr: product.name_fr,
      nameAr: product.name_ar,
      unitPriceMillimes: product.price_millimes,
      stationId: product.station_id,
      status: "ACTIVE" as const,
    };
  });
}

async function insertLines(
  tx: Tx,
  orderId: string,
  lines: readonly {
    productId: string;
    quantity: number;
    note: string | null;
    nameFr: string;
    unitPriceMillimes: number;
    stationId: string;
  }[],
): Promise<void> {
  for (const line of lines) {
    await tx`
      insert into order_items (
        id, order_id, product_id, product_name_snapshot, unit_price_millimes, quantity, note, station_id, status
      ) values (
        ${newId()}, ${orderId}, ${line.productId}, ${line.nameFr}, ${line.unitPriceMillimes},
        ${line.quantity}, ${line.note}, ${line.stationId}, 'ACTIVE'
      )
    `;
  }
}

async function track(
  tx: Tx,
  siteId: string,
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  await tx`
    insert into audit_log (
      id, site_id, actor_user_id, device_id, action, entity_type, entity_id, before, after
    ) values (
      ${newId()}, ${siteId}, ${actor.id}, ${actor.deviceId}, ${action}, ${entityType}, ${entityId},
      ${before == null ? null : tx.json(before as postgres.JSONValue)},
      ${after == null ? null : tx.json(after as postgres.JSONValue)}
    )
  `;
  await tx`
    insert into sync_outbox (id, site_id, entity_type, entity_id, op, payload)
    values (
      ${newId()}, ${siteId}, ${entityType}, ${entityId}, 'UPSERT',
      ${tx.json({ action, entityId } as postgres.JSONValue)}
    )
  `;
}

async function catalog(sql: postgres.Sql, siteId: string) {
  const categories = await sql<
    {
      id: string;
      name_fr: string;
      name_ar: string;
      station_kind: StationKind;
      sort_order: number;
    }[]
  >`
    select c.id, c.name_fr, c.name_ar, s.kind as station_kind, c.sort_order
    from categories c
    join stations s on s.id = c.station_id
    where c.site_id = ${siteId} and c.is_active = true
    order by c.sort_order, c.name_fr
  `;
  const products = await sql<
    {
      id: string;
      category_id: string;
      name_fr: string;
      name_ar: string;
      price_millimes: number;
      vat_rate_bp: number;
      sort_order: number;
    }[]
  >`
    select id, category_id, name_fr, name_ar, price_millimes, vat_rate_bp, sort_order
    from products
    where site_id = ${siteId} and is_available = true
    order by sort_order, name_fr
  `;
  return {
    categories: categories.map((category) => ({
      id: category.id,
      nameFr: category.name_fr,
      nameAr: category.name_ar,
      stationKind: category.station_kind,
      products: products
        .filter((product) => product.category_id === category.id)
        .map((product) => ({
          id: product.id,
          nameFr: product.name_fr,
          nameAr: product.name_ar,
          priceMillimes: product.price_millimes,
          vatRateBp: product.vat_rate_bp,
        })),
    })),
  };
}

async function listTables(sql: postgres.Sql, siteId: string, actor: Actor) {
  const tables = await sql<
    { id: string; label: string; zone: string; seats: number; status: TableStatus }[]
  >`
    select id, label, zone, seats, status from floor_tables where site_id = ${siteId} order by label
  `;
  const open = await sql<{ id: string; table_id: string; server_id: string }[]>`
    select id, table_id, server_id from orders
    where site_id = ${siteId} and table_id is not null and status in ('DRAFT', 'SENT', 'SERVED')
  `;
  return {
    tables: tables.map((table) => {
      const order = open.find((candidate) => candidate.table_id === table.id);
      let openOrderId: string | null = null;
      if (order) {
        try {
          assertCanViewOrder(actor.role, order.server_id, actor.id);
          openOrderId = order.id;
        } catch {
          openOrderId = null;
        }
      }
      return {
        id: table.id,
        label: table.label,
        zone: table.zone,
        seats: table.seats,
        status: table.status,
        openOrderId,
      };
    }),
  };
}

async function listOrders(
  sql: postgres.Sql,
  siteId: string,
  actor: Actor,
  filter: { status?: OrderStatus; tableId?: string; mine: boolean; cursor?: string; limit: number },
) {
  const serverId = actor.role === "WAITER" || filter.mine ? actor.id : null;
  const cursor = filter.cursor ? decodeCursor(filter.cursor) : null;
  const rows = await sql<{ id: string }[]>`
    select id from orders
    where site_id = ${siteId}
      and (${filter.status ?? null}::text is null or status = ${filter.status ?? null}::order_status)
      and (${filter.tableId ?? null}::uuid is null or table_id = ${filter.tableId ?? null}::uuid)
      and (${serverId}::uuid is null or server_id = ${serverId}::uuid)
      and (
        ${cursor?.openedAt ?? null}::timestamptz is null
        or (opened_at, id) < (${cursor?.openedAt ?? null}::timestamptz, ${cursor?.id ?? null}::uuid)
      )
    order by opened_at desc, id desc
    limit ${filter.limit + 1}
  `;
  const page = rows.slice(0, filter.limit);
  const orders = [];
  for (const row of page) {
    orders.push(await readOrder(sql, row.id));
  }
  const extra = rows[filter.limit];
  const last = orders[orders.length - 1];
  return {
    orders,
    nextCursor: extra && last ? encodeCursor(last.openedAt, last.id) : null,
  };
}

async function getOrder(
  sql: postgres.Sql,
  siteId: string,
  actor: Actor,
  orderId: string,
  includePrintJobs: boolean,
) {
  const rows = await sql<{ site_id: string; server_id: string }[]>`
    select site_id, server_id from orders where id = ${orderId}
  `;
  const row = rows[0];
  if (!row || row.site_id !== siteId) {
    throw new DomainError("NOT_FOUND");
  }
  assertCanViewOrder(actor.role, row.server_id, actor.id);
  const order = await readOrder(sql, orderId);
  const cancellations = await sql<
    {
      id: string;
      order_item_id: string | null;
      requested_by: string;
      reason: string;
      status: CancellationStatus;
      decided_by: string | null;
      decided_at: Date | string | null;
      override_by: string | null;
    }[]
  >`
    select id, order_item_id, requested_by, reason, status, decided_by, decided_at, override_by
    from cancellation_requests where order_id = ${orderId} order by created_at
  `;
  const printJobs = includePrintJobs
    ? await sql<
        {
          id: string;
          station_id: string;
          type: PrintJobType;
          status: PrintJobStatus;
          payload: unknown;
        }[]
      >`
        select id, station_id, type, status, payload from print_jobs where order_id = ${orderId} order by created_at
      `
    : undefined;
  return {
    order,
    cancellations: cancellations.map((cancellation) => ({
      id: cancellation.id,
      orderItemId: cancellation.order_item_id,
      requestedBy: cancellation.requested_by,
      reason: cancellation.reason,
      status: cancellation.status,
      decidedBy: cancellation.decided_by,
      decidedAt: iso(cancellation.decided_at),
      overrideBy: cancellation.override_by,
    })),
    ...(printJobs
      ? {
          printJobs: printJobs.map((job) => ({
            id: job.id,
            stationId: job.station_id,
            type: job.type,
            status: job.status,
            payload: job.payload,
          })),
        }
      : {}),
  };
}

async function listCancellations(sql: postgres.Sql, siteId: string, status: CancellationStatus) {
  const rows = await sql<
    {
      id: string;
      order_id: string;
      order_item_id: string | null;
      requested_by: string;
      reason: string;
      status: CancellationStatus;
    }[]
  >`
    select c.id, c.order_id, c.order_item_id, c.requested_by, c.reason, c.status
    from cancellation_requests c
    join orders o on o.id = c.order_id
    where o.site_id = ${siteId} and c.status = ${status}::cancellation_status
    order by c.created_at
  `;
  return {
    cancellations: rows.map((row) => ({
      id: row.id,
      orderId: row.order_id,
      orderItemId: row.order_item_id,
      requestedBy: row.requested_by,
      reason: row.reason,
      status: row.status,
    })),
  };
}

function orderEvent(
  name: "order.created" | "order.updated" | "order.sent",
  order: PublicOrder,
): RealtimeMessage {
  return { name, serverId: order.serverId, payload: { version: order.version, order } };
}

function cancellationPayload(
  order: PublicOrder,
  id: string,
  orderItemId: string | null,
  status: CancellationStatus,
  reason: string,
) {
  return {
    version: order.version,
    serverId: order.serverId,
    cancellation: { id, orderId: order.id, orderItemId, status, reason },
    order,
  };
}

function toPublicItem(item: Item): PublicOrderItem {
  return {
    id: item.id,
    productId: item.productId,
    productNameSnapshot: item.productNameSnapshot,
    unitPriceMillimes: item.unitPriceMillimes,
    quantity: item.quantity,
    note: item.note,
    stationId: item.stationId,
    status: item.status,
    sentAt: item.sentAt,
  };
}

interface HeaderRow {
  id: string;
  site_id: string;
  table_id: string | null;
  server_id: string;
  server_name: string;
  status: OrderStatus;
  business_date: string;
  daily_number: number;
  note: string | null;
  total_millimes: number;
  version: number;
  opened_at: Date | string;
  sent_at: Date | string | null;
  closed_at: Date | string | null;
}

function mapHeader(row: HeaderRow): Header {
  return {
    id: row.id,
    tableId: row.table_id,
    serverId: row.server_id,
    serverName: row.server_name,
    status: row.status,
    businessDate: dateOnly(row.business_date),
    dailyNumber: row.daily_number,
    note: row.note,
    totalMillimes: row.total_millimes,
    version: row.version,
    openedAt: iso(row.opened_at) ?? new Date(0).toISOString(),
    sentAt: iso(row.sent_at),
    closedAt: iso(row.closed_at),
  };
}

interface ItemRow {
  id: string;
  product_id: string;
  product_name_snapshot: string;
  unit_price_millimes: number;
  quantity: number;
  note: string | null;
  station_id: string;
  status: OrderItemStatus;
  sent_at: Date | string | null;
  name_ar: string;
  station_kind: StationKind;
  printer_id: string;
}

interface ProductRow {
  id: string;
  site_id: string;
  name_fr: string;
  name_ar: string;
  price_millimes: number;
  is_available: boolean;
  station_id: string;
}

function iso(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function encodeCursor(openedAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ openedAt, id }), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): { openedAt: string; id: string } {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      openedAt?: string;
      id?: string;
    };
    if (!parsed.openedAt || !parsed.id) {
      throw new Error("bad cursor");
    }
    return { openedAt: parsed.openedAt, id: parsed.id };
  } catch {
    throw new DomainError("NOT_FOUND");
  }
}

function dateOnly(value: Date | string): string {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${value.getUTCFullYear()}-${month}-${day}`;
}

function uniqueConstraint(error: unknown): string | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const record = error as { code?: string; constraint_name?: string; message?: string };
  if (record.code !== "23505") {
    return null;
  }
  if (typeof record.constraint_name === "string" && record.constraint_name.length > 0) {
    return record.constraint_name;
  }
  if (record.message?.includes("orders_one_open_per_table")) {
    return "orders_one_open_per_table";
  }
  if (record.message?.includes("orders_pkey")) {
    return "orders_pkey";
  }
  return null;
}
