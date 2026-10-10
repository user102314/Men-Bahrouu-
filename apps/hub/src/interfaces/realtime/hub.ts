import type { Role } from "@resto/shared";
import type { FastifyInstance } from "fastify";
import { Server } from "socket.io";

import type { AuthService } from "../../application/auth-service.js";

export interface LiveEvent {
  name: string;
  serverId: string;
  payload: unknown;
}

export interface RealtimeHub {
  publish(messages: readonly LiveEvent[]): void;
}

export function attachRealtime(
  app: FastifyInstance,
  auth: AuthService,
  origin: readonly string[] | ((origin: string | undefined, callback: (error: null, allow: boolean) => void) => void),
): RealtimeHub {
  const io = new Server(app.server, {
    cors: { origin: typeof origin === "function" ? origin : [...origin] },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== "string" || token.length === 0) {
      next(new Error("AUTH_INVALID"));
      return;
    }
    void authenticate(token)
      .then((user) => {
        if (!user) {
          next(new Error("AUTH_INVALID"));
          return;
        }
        socket.data.auth = user;
        next();
      })
      .catch(() => {
        next(new Error("AUTH_INVALID"));
      });
  });

  io.on("connection", (socket) => {
    const user = socket.data.auth as { id: string; role: Role; siteId: string } | undefined;
    if (!user) {
      socket.disconnect(true);
      return;
    }
    void socket.join(`site:${user.siteId}`);
    void socket.join(`role:${user.role}`);
    void socket.join(`user:${user.id}`);
  });

  app.addHook("onClose", async () => {
    await io.close();
  });

  return {
    publish(messages: readonly LiveEvent[]) {
      for (const message of messages) {
        if (message.name === "table.updated") {
          io.to("role:WAITER")
            .to("role:CASHIER")
            .to("role:ADMIN")
            .emit(message.name, message.payload);
          continue;
        }
        if (message.name.startsWith("print.") || message.name === "catalog.updated" || message.name.startsWith("shift.")) {
          io.to("role:CASHIER").to("role:ADMIN").emit(message.name, message.payload);
          continue;
        }
        if (message.name === "stock.low" || message.name === "settings.updated") {
          io.to("role:ADMIN").emit(message.name, message.payload);
          continue;
        }
        io.to(`user:${message.serverId}`)
          .to("role:CASHIER")
          .to("role:ADMIN")
          .emit(message.name, message.payload);
      }
    },
  };

  async function authenticate(token: string) {
    const payload = app.jwt.verify<{ sub: string; role: Role; siteId: string; deviceId?: string }>(
      token,
    );
    const user = await auth.activeSession(payload.sub, payload.deviceId ?? null);
    if (!user) {
      return null;
    }
    return { id: user.id, role: user.role, siteId: user.siteId };
  }
}
