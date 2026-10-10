import { newId, ticketPayloadSchema, type PrintJobStatus, type TicketPayload } from "@resto/shared";
import type postgres from "postgres";

import type { PrinterGateway } from "../../application/printer-gateway.js";
import type { Clock } from "../../domain/auth/clock.js";
import { renderTicket } from "../../domain/printing/ticket-text.js";

const BACKOFF_SECONDS = [2, 5, 15, 30, 60];

export interface PrintLiveEvent {
  name: "print.job.updated" | "print.failed";
  serverId: string;
  payload: {
    id: string;
    orderId: string;
    status: PrintJobStatus;
    attempts: number;
    type: string;
  };
}

interface ClaimedJob {
  id: string;
  order_id: string;
  station_id: string;
  printer_id: string;
  type: TicketPayload["type"];
  payload: TicketPayload;
  attempts: number;
  fallback_used: boolean;
  host: string;
  port: number;
  fallback_station_id: string | null;
}

export class PrintService {
  private draining = false;
  private queued = false;
  private idle: Promise<void> = Promise.resolve();
  readonly delivered: PrintLiveEvent[] = [];

  constructor(
    private readonly sql: postgres.Sql,
    private readonly gateway: PrinterGateway,
    private readonly clock: Clock,
    private readonly options: {
      siteId: string;
      columns: number;
      connectTimeoutMs: number;
      writeTimeoutMs: number;
      maxAttempts: number;
    },
    private readonly emit: (events: readonly PrintLiveEvent[]) => void,
  ) {}

  /** Jobs left PRINTING by a crash are printed again. A duplicate slip is safer than a lost one. */
  async recoverInterrupted(): Promise<void> {
    await this.sql`
      update print_jobs
      set status = 'PENDING', next_attempt_at = ${this.clock.now().toISOString()}, updated_at = now()
      where site_id = ${this.options.siteId} and status = 'PRINTING'
    `;
  }

  kick(): void {
    if (this.draining) {
      this.queued = true;
      return;
    }
    this.draining = true;
    this.idle = this.drain().finally(() => {
      this.draining = false;
      if (this.queued) {
        this.queued = false;
        this.kick();
      }
    });
  }

  async kickAndWait(): Promise<void> {
    this.kick();
    do {
      await this.idle;
    } while (this.draining);
  }

  private async drain(): Promise<void> {
    const jobs = await this.claim();
    const groups = new Map<string, ClaimedJob[]>();
    for (const job of jobs) {
      const bucket = groups.get(job.printer_id) ?? [];
      bucket.push(job);
      groups.set(job.printer_id, bucket);
    }
    await Promise.all([...groups.values()].map((group) => this.printSequence(group)));
  }

  private async claim(): Promise<ClaimedJob[]> {
    const now = this.clock.now().toISOString();
    return this.sql.begin(async (tx) => {
      const rows = await tx<ClaimedJob[]>`
        select j.id, j.order_id, j.station_id, j.printer_id, j.type, j.payload, j.attempts,
               j.fallback_used, p.host, p.port, s.fallback_station_id
        from print_jobs j
        join printers p on p.id = j.printer_id
        join stations s on s.id = j.station_id
        where j.site_id = ${this.options.siteId}
          and j.status = 'PENDING'
          and (j.next_attempt_at is null or j.next_attempt_at <= ${now})
        order by j.created_at
        for update of j skip locked
        limit 20
      `;
      if (rows.length === 0) {
        return [];
      }
      const ids = rows.map((row) => row.id);
      await tx`
        update print_jobs set status = 'PRINTING', updated_at = now()
        where id in ${tx(ids)}
      `;
      return rows.map((row) => ({ ...row, payload: ticketPayloadSchema.parse(row.payload) }));
    });
  }

  private async printSequence(jobs: readonly ClaimedJob[]): Promise<void> {
    for (const job of jobs) {
      await this.printOne(job);
    }
  }

  private async printOne(job: ClaimedJob): Promise<void> {
    try {
      await this.gateway.send(
        { host: job.host, port: job.port },
        renderTicket(job.payload, this.options.columns),
        {
          connectTimeoutMs: this.options.connectTimeoutMs,
          writeTimeoutMs: this.options.writeTimeoutMs,
        },
      );
      await this.sql`
        update print_jobs
        set status = 'PRINTED', printed_at = ${this.clock.now().toISOString()}, last_error = null, updated_at = now()
        where id = ${job.id}
      `;
      this.publish(event("print.job.updated", job, "PRINTED", job.attempts));
    } catch (error) {
      await this.recordFailure(job, error instanceof Error ? error.message : "print failed");
    }
  }

  private async recordFailure(job: ClaimedJob, message: string): Promise<void> {
    const attempts = job.attempts + 1;
    if (attempts >= this.options.maxAttempts) {
      if (!job.fallback_used && job.fallback_station_id) {
        const moved = await this.moveToFallback(job, message);
        if (moved) {
          return;
        }
      }
      await this.sql`
        update print_jobs
        set status = 'FAILED', attempts = ${attempts}, last_error = ${message}, updated_at = now()
        where id = ${job.id}
      `;
      this.publish(event("print.failed", job, "FAILED", attempts));
      return;
    }
    const delay = BACKOFF_SECONDS[attempts - 1] ?? 60;
    const next = new Date(this.clock.now().getTime() + delay * 1000).toISOString();
    await this.sql`
      update print_jobs
      set status = 'PENDING', attempts = ${attempts}, last_error = ${message},
          next_attempt_at = ${next}, updated_at = now()
      where id = ${job.id}
    `;
  }

  private async moveToFallback(job: ClaimedJob, message: string): Promise<boolean> {
    const rows = await this.sql<
      { id: string; kind: TicketPayload["stationKind"]; printer_id: string }[]
    >`
      select id, kind, printer_id from stations where id = ${job.fallback_station_id}
    `;
    const fallback = rows[0];
    if (!fallback) {
      return false;
    }
    const payload = ticketPayloadSchema.parse({
      ...job.payload,
      stationKind: fallback.kind,
      redirectedFrom: job.payload.stationKind,
    });
    await this.sql`
      update print_jobs
      set status = 'PENDING', attempts = 0, fallback_used = true, last_error = ${message},
          station_id = ${fallback.id}, printer_id = ${fallback.printer_id},
          payload = ${this.sql.json(payload)}, next_attempt_at = ${this.clock.now().toISOString()},
          updated_at = now()
      where id = ${job.id}
    `;
    return true;
  }

  async listPrinters() {
    const rows = await this.sql<{ id: string; name: string; host: string; port: number }[]>`
      select id, name, host, port from printers where site_id = ${this.options.siteId} and is_active = true order by name
    `;
    return rows;
  }

  async list(filter: { status?: PrintJobStatus; orderId?: string }) {
    const rows = await this.sql<
      {
        id: string;
        order_id: string;
        station_id: string;
        type: string;
        status: PrintJobStatus;
        attempts: number;
        last_error: string | null;
        payload: unknown;
      }[]
    >`
      select id, order_id, station_id, type, status, attempts, last_error, payload
      from print_jobs
      where site_id = ${this.options.siteId}
        and (${filter.status ?? null}::text is null or status = ${filter.status ?? null}::print_job_status)
        and (${filter.orderId ?? null}::uuid is null or order_id = ${filter.orderId ?? null}::uuid)
      order by created_at
    `;
    return rows.map((row) => ({
      id: row.id,
      orderId: row.order_id,
      stationId: row.station_id,
      type: row.type,
      status: row.status,
      attempts: row.attempts,
      lastError: row.last_error,
      payload: row.payload,
    }));
  }

  async retry(jobId: string, actorId: string, deviceId: string | null): Promise<boolean> {
    const rows = await this.sql<{ id: string }[]>`
      update print_jobs
      set status = 'PENDING', attempts = 0, last_error = null, next_attempt_at = ${this.clock.now().toISOString()},
          updated_at = now()
      where id = ${jobId} and site_id = ${this.options.siteId} and status = 'FAILED'
      returning id
    `;
    const row = rows[0];
    if (!row) {
      return false;
    }
    await this.audit(actorId, deviceId, "print.job.retried", jobId);
    this.kick();
    return true;
  }

  async reprint(
    orderId: string,
    stationId: string | null,
    actorId: string,
    deviceId: string | null,
  ): Promise<number> {
    const jobs = await this.sql<{ station_id: string; printer_id: string; payload: unknown }[]>`
      select distinct on (station_id) station_id, printer_id, payload
      from print_jobs
      where order_id = ${orderId} and site_id = ${this.options.siteId}
        and (${stationId}::uuid is null or station_id = ${stationId}::uuid)
        and type::text <> 'REPRINT'
      order by station_id, created_at desc
    `;
    for (const job of jobs) {
      const original = ticketPayloadSchema.parse(job.payload);
      const payload = ticketPayloadSchema.parse({ ...original, type: "REPRINT" });
      const id = newId();
      await this.sql`
        insert into print_jobs (
          id, site_id, order_id, station_id, printer_id, type, status, payload, attempts
        ) values (
          ${id}, ${this.options.siteId}, ${orderId}, ${job.station_id}, ${job.printer_id},
          'REPRINT', 'PENDING', ${this.sql.json(payload)}, 0
        )
      `;
    }
    if (jobs.length > 0) {
      await this.audit(actorId, deviceId, "order.reprinted", orderId);
      this.kick();
    }
    return jobs.length;
  }

  private async audit(actorId: string, deviceId: string | null, action: string, entityId: string) {
    await this.sql`
      insert into audit_log (id, site_id, actor_user_id, device_id, action, entity_type, entity_id, before, after)
      values (
        ${newId()}, ${this.options.siteId}, ${actorId}, ${deviceId}, ${action}, 'print_job', ${entityId},
        null, ${this.sql.json({ entityId })}
      )
    `;
  }

  private publish(message: PrintLiveEvent): void {
    this.delivered.push(message);
    this.emit([message]);
  }
}

function event(
  name: PrintLiveEvent["name"],
  job: ClaimedJob,
  status: PrintJobStatus,
  attempts: number,
): PrintLiveEvent {
  return {
    name,
    serverId: "",
    payload: { id: job.id, orderId: job.order_id, status, attempts, type: job.type },
  };
}
