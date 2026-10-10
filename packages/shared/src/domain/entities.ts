import type { Millimes } from "../money.js";
import type {
  CancellationStatus,
  DeviceType,
  OrderItemStatus,
  OrderStatus,
  OutboxOp,
  PrintJobStatus,
  PrintJobType,
  Role,
  StationKind,
  TableStatus,
} from "./enums.js";

export interface Site {
  id: string;
  name: string;
  address: string;
  timezone: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  siteId: string;
  displayName: string;
  role: Role;
  email: string | null;
  passwordHash: string | null;
  pinHash: string | null;
  isActive: boolean;
  failedAttempts: number;
  lockedUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PublicUser = Omit<User, "passwordHash" | "pinHash">;

export interface Device {
  id: string;
  siteId: string;
  name: string;
  type: DeviceType;
  tokenHash: string;
  isActive: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PublicDevice = Omit<Device, "tokenHash">;

export interface Printer {
  id: string;
  siteId: string;
  name: string;
  host: string;
  port: number;
  paperWidthMm: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Station {
  id: string;
  siteId: string;
  kind: StationKind;
  name: string;
  printerId: string;
  fallbackStationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  siteId: string;
  nameFr: string;
  nameAr: string;
  stationId: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  siteId: string;
  categoryId: string;
  nameFr: string;
  nameAr: string;
  priceMillimes: Millimes;
  vatRateBp: number;
  isAvailable: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface FloorTable {
  id: string;
  siteId: string;
  label: string;
  zone: string;
  seats: number;
  status: TableStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: string;
  siteId: string;
  tableId: string | null;
  serverId: string;
  status: OrderStatus;
  businessDate: string;
  dailyNumber: number;
  note: string | null;
  totalMillimes: Millimes;
  version: number;
  openedAt: string;
  sentAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  productNameSnapshot: string;
  unitPriceMillimes: Millimes;
  quantity: number;
  note: string | null;
  stationId: string;
  status: OrderItemStatus;
  sentAt: string | null;
  voidedAt: string | null;
  voidedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CancellationRequest {
  id: string;
  orderId: string;
  orderItemId: string | null;
  requestedBy: string;
  reason: string;
  status: CancellationStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  overrideBy: string | null;
  createdAt: string;
}

export interface PrintJob {
  id: string;
  siteId: string;
  orderId: string;
  stationId: string;
  printerId: string;
  type: PrintJobType;
  status: PrintJobStatus;
  payload: unknown;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  printedAt: string | null;
}

export interface AuditLog {
  id: string;
  siteId: string;
  actorUserId: string | null;
  deviceId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  at: string;
}

export interface SyncOutboxEvent {
  id: string;
  siteId: string;
  entityType: string;
  entityId: string;
  op: OutboxOp;
  payload: unknown;
  createdAt: string;
  sentAt: string | null;
  attempts: number;
}
