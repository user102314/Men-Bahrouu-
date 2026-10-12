import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { newId } from "../packages/shared/src/ids.ts";

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(root, "..");
const ticketDir = join(root, "fake-printer", "out");
const hub = `http://127.0.0.1:${process.env.PORT ?? "3000"}`;

interface Profile {
  id: string;
  displayName: string;
  role: string;
}

interface OrderItem {
  id: string;
  productNameSnapshot: string;
  quantity: number;
  note: string | null;
  status: string;
}

interface Order {
  id: string;
  dailyNumber: number;
  status: string;
  totalMillimes: number;
  items: OrderItem[];
}

interface PrintJob {
  type: string;
  status: string;
  payload: { stationKind?: string; lines?: { nameFr: string; quantity: number }[] };
}

const seenTickets = new Set(existingTickets());

const devices = JSON.parse(readFileSync(join(repoRoot, ".devices.dev.json"), "utf8")) as {
  tablet: string;
  cashierPc: string;
};

const profiles = await getJson<{ profiles: Profile[] }>("/auth/profiles", {
  headers: { "x-device-token": devices.tablet },
});
console.log("Profils de la tablette :");
for (const profile of profiles.profiles) {
  console.log(`- ${profile.displayName} (${profile.role})`);
}
const mohamed = required(
  profiles.profiles.find((profile) => profile.displayName === "Mohamed"),
  "Mohamed",
);
const waiter = await login(devices.tablet, mohamed.id, "1234");

const tables = await getJson<{ tables: { id: string; label: string }[] }>("/tables", {
  headers: auth(waiter),
});
const table = required(
  tables.tables.find((entry) => entry.label === "T3"),
  "table T3",
);
const catalog = await getJson<{
  categories: { products: { id: string; nameFr: string }[] }[];
}>("/catalog", { headers: auth(waiter) });
const products = new Map(
  catalog.categories
    .flatMap((category) => category.products)
    .map((product) => [product.nameFr, product.id]),
);

const order = await postJson<Order>("/orders", waiter, {
  id: newId(),
  tableId: table.id,
  items: [
    line(products, "Thé aux amandes", 1),
    line(products, "Thé aux amandes", 1),
    line(products, "Citronnade", 1),
    line(products, "Kafteji", 1),
    { ...line(products, "Brik thon", 1), note: "sans harissa" },
  ],
});
console.log(`Commande ${order.dailyNumber} créée (${order.id}).`);
await postJson<Order>(`/orders/${order.id}/send`, waiter, {});
const firstTickets = await waitForTickets(2);
printTickets("Envoi", firstTickets);

const sent = await getJson<{ order: Order }>(`/orders/${order.id}`, { headers: auth(waiter) });
await postJson<Order>(`/orders/${order.id}/items`, waiter, {
  items: [line(products, "Fruits de saison", 1)],
});
await postJson<Order>(`/orders/${sent.order.id}/send`, waiter, {});
printTickets("Ajout", await waitForTickets(1));

const coffee = required(
  sent.order.items.find((item) => item.productNameSnapshot === "Thé aux amandes"),
  "thé",
);
const cancellation = await postJson<{ cancellationId: string }>(
  `/orders/${order.id}/cancellation-requests`,
  waiter,
  { orderItemId: coffee.id, reason: "Client a changé d'avis" },
);

const cashierProfiles = await getJson<{ profiles: Profile[] }>("/auth/profiles", {
  headers: { "x-device-token": devices.cashierPc },
});
const sonia = required(
  cashierProfiles.profiles.find((profile) => profile.displayName === "Sonia"),
  "Sonia",
);
const cashier = await login(devices.cashierPc, sonia.id, "4321");
const approved = await fetch(
  `${hub}/cancellation-requests/${cancellation.cancellationId}/decision`,
  {
    method: "POST",
    headers: { ...auth(cashier), "content-type": "application/json" },
    body: JSON.stringify({ approve: true }),
  },
);
const approvedBody = (await approved.json()) as { error?: { code?: string } };
console.log(`Approbation du caissier : ${approved.status} ${approvedBody.error?.code ?? ""}`);
if (approved.status !== 200) {
  throw new Error("the cashier should approve the cancellation");
}
printTickets("Annulation", await waitForTickets(1));

const detail = await getJson<{
  order: Order;
  cancellations: { status: string }[];
  printJobs: PrintJob[];
}>(`/orders/${order.id}`, { headers: auth(cashier) });
console.log("");
console.log("Résumé");
console.log(
  `Commande ${detail.order.dailyNumber} : ${detail.order.status}, total ${detail.order.totalMillimes} millimes`,
);
for (const item of detail.order.items) {
  console.log(
    `- ${item.quantity} x ${item.productNameSnapshot} [${item.status}]${item.note ? ` (${item.note})` : ""}`,
  );
}
console.log(`Annulations : ${detail.cancellations.map((entry) => entry.status).join(", ")}`);
for (const job of detail.printJobs) {
  const names = (job.payload.lines ?? [])
    .map((entry) => `${entry.quantity} ${entry.nameFr}`)
    .join(", ");
  console.log(`- ticket ${job.type} ${job.payload.stationKind ?? ""} ${job.status} : ${names}`);
}

function line(catalogProducts: Map<string, string>, name: string, quantity: number) {
  const productId = catalogProducts.get(name);
  if (!productId) {
    throw new Error(`missing product ${name}`);
  }
  return { productId, quantity };
}

function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

async function login(deviceToken: string, userId: string, pin: string): Promise<string> {
  const body = await postJson<{ token: string }>(
    "/auth/login-pin",
    "",
    { userId, pin },
    deviceToken,
  );
  return body.token;
}

async function getJson<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${hub}${path}`, init);
  return read<T>(response);
}

async function postJson<T>(
  path: string,
  token: string,
  body: unknown,
  deviceToken?: string,
): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  if (deviceToken) {
    headers["x-device-token"] = deviceToken;
  }
  const response = await fetch(`${hub}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return read<T>(response);
}

async function read<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.url} ${text}`);
  }
  return JSON.parse(text) as T;
}

function existingTickets(): string[] {
  try {
    return readdirSync(ticketDir).filter((name) => name.endsWith(".txt"));
  } catch {
    return [];
  }
}

async function waitForTickets(count: number): Promise<string[]> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const fresh = existingTickets().filter((name) => !seenTickets.has(name));
    if (fresh.length >= count) {
      const picked = fresh.sort().slice(0, count);
      for (const name of picked) {
        seenTickets.add(name);
      }
      return picked;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`timed out waiting for ${count} ticket(s)`);
}

function printTickets(title: string, files: string[]): void {
  console.log("");
  console.log(title);
  for (const name of files) {
    const port = name.split("-")[0];
    console.log(`----- imprimante ${port} -----`);
    console.log(readFileSync(join(ticketDir, name), "utf8").trimEnd());
    console.log("----- fin -----");
  }
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new Error(`missing ${label}`);
  }
  return value;
}
