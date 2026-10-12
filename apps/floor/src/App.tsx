import { newId, type PublicOrder } from "@resto/shared";
import { useEffect, useRef, useState } from "react";

import { text, type Lang } from "./copy.js";
import {
  addItems,
  catalog,
  createFloorTable,
  createOrder,
  dailySpecials,
  loginStaff,
  me,
  money,
  order,
  pay,
  requestBill,
  requestCancellation,
  sendOrder,
  tables,
  type CatalogCategory,
  type FloorTable,
} from "./hub.js";
import { FloorSignals } from "./FloorSignals.js";
import { OrderDesk, type DraftLine } from "./OrderDesk.js";
import { PinPad } from "./PinPad.js";
import { ServiceRecette } from "./ServiceRecette.js";
import { clearFloorSession, loadFloorSession, saveFloorSession, type FloorSession } from "./session.js";
import { TableBoard } from "./TableBoard.js";
import { nextTableNumber, pageStartFor, zoneForNumber } from "./tables.js";

let pinFlight: string | null = null;

interface SendJob {
  tableId: string;
  openOrderId: string | null;
  lines: DraftLine[];
}

export function App() {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem("resto.floor.lang") === "ar" ? "ar" : "fr"));
  const [session, setSession] = useState<FloorSession | null>(() => loadFloorSession());
  const [pin, setPin] = useState("");
  const [pinFor, setPinFor] = useState<"enter" | "send" | null>(session ? null : "enter");
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pageStart, setPageStart] = useState(1);
  const [picked, setPicked] = useState<{ table: FloorTable; number: number } | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [sent, setSent] = useState<PublicOrder["items"]>([]);
  const [serverName, setServerName] = useState("");
  const [floorTables, setFloorTables] = useState<FloorTable[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [specialIds, setSpecialIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [addingTable, setAddingTable] = useState(false);
  const [orderTick, setOrderTick] = useState(0);
  const [job, setJob] = useState<SendJob | null>(null);
  const jobRef = useRef(job);
  const langRef = useRef(lang);
  jobRef.current = job;
  langRef.current = lang;
  const copy = text(lang);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    localStorage.setItem("resto.floor.lang", lang);
  }, [lang]);

  useEffect(() => {
    if (!session) {
      return;
    }
    let stop = false;
    void tables()
      .then((body) => {
        if (!stop) {
          setFloorTables(body.tables);
        }
      })
      .catch(() => setMessage(text(lang).hubTables));
    const loadMenu = () => {
      void catalog()
        .then((body) => {
          if (!stop) {
            setCategories(body.categories);
          }
        })
        .catch(() => setMessage(text(lang).hubCatalog));
      void dailySpecials()
        .then((body) => {
          if (!stop) {
            setSpecialIds(body.productIds);
          }
        })
        .catch(() => {
          if (!stop) {
            setSpecialIds([]);
          }
        });
    };
    loadMenu();
    window.addEventListener("focus", loadMenu);
    return () => {
      stop = true;
      window.removeEventListener("focus", loadMenu);
    };
  }, [session, lang]);

  useEffect(() => {
    const openId = picked?.table.openOrderId;
    if (!openId) {
      setServerName("");
      return;
    }
    let stop = false;
    void order(openId)
      .then((body) => {
        if (!stop) {
          setServerName(body.order.serverName);
          setSent(body.order.items);
        }
      })
      .catch(() => {
        if (!stop) {
          setSent([]);
        }
      });
    return () => {
      stop = true;
    };
  }, [picked, orderTick]);

  useEffect(() => {
    if (pin.length !== 4 || !pinFor) {
      return;
    }
    const flight = `${pinFor}:${pin}`;
    if (pinFlight === flight) {
      return;
    }
    pinFlight = flight;
    const code = pin;
    const action = pinFor;
    const pending = jobRef.current;
    setBusy(true);
    setHint(null);
    let authed = false;
    void loginStaff(code)
      .then(async (result) => {
        const words = text(langRef.current);
        saveFloorSession({ token: result.token, role: "WAITER", displayName: "" });
        const profile = await me();
        if (profile.role !== "WAITER" && profile.role !== "CASHIER") {
          clearFloorSession();
          setHint(words.notService);
          setPin("");
          return;
        }
        const next = { token: result.token, role: profile.role, displayName: profile.displayName };
        saveFloorSession(next);
        authed = true;
        setSession(next);
        setPin("");
        setPinFor(null);
        if (action === "send" && pending) {
          await submit(next, pending);
        }
      })
      .catch((error: unknown) => {
        const words = text(langRef.current);
        if (authed) {
          const failure = error instanceof Error ? error.message : "";
          setMessage(failure === "TABLE_BUSY" ? words.busyTable : words.failed);
          return;
        }
        if (action === "send") {
          setMessage(words.refused);
          setPin("");
          setPinFor(null);
          return;
        }
        clearFloorSession();
        setSession(null);
        setHint(words.refused);
        setPin("");
        setPinFor("enter");
      })
      .finally(() => {
        pinFlight = null;
        setBusy(false);
      });
  }, [pin, pinFor]);

  async function submit(current: FloorSession, currentJob: SendJob): Promise<void> {
    const items = currentJob.lines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      ...(line.note ? { note: line.note } : {}),
    }));
    if (items.length === 0) {
      return;
    }
    if (currentJob.openOrderId) {
      await addItems(currentJob.openOrderId, items);
      await sendOrder(currentJob.openOrderId);
    } else {
      const created = await createOrder({
        id: newId(),
        tableId: currentJob.tableId,
        items,
      });
      await sendOrder(created.id);
    }
    setLines([]);
    setJob(null);
    setPicked(null);
    setMessage(`${copy.sentOk} · ${current.displayName}`);
    const fresh = await tables();
    setFloorTables(fresh.tables);
  }

  function leave(): void {
    clearFloorSession();
    setSession(null);
    setPinFor("enter");
    setPin("");
    setLines([]);
    setPicked(null);
    setJob(null);
  }

  function switchLang(): void {
    setLang((current) => (current === "fr" ? "ar" : "fr"));
  }

  if (!session || pinFor) {
    const verifying = pinFor === "send";
    return (
      <main className="login-screen relative bg-fond">
        <div className="zellige" aria-hidden />
        <button
          type="button"
          className="absolute end-3 top-3 z-10 min-h-11 rounded-full border border-line bg-surface px-4 text-sm font-semibold"
          style={{ boxShadow: "var(--shadow-soft)" }}
          onClick={switchLang}
        >
          {copy.lang}
        </button>
        <section className="login-arch relative z-10 border border-line bg-surface">
          <div className="mb-4 flex flex-col items-center gap-2 text-center">
            <span className="flex items-center gap-2">
              <span className="login-mark">M</span>
              <span className="font-display text-lg font-semibold">{copy.brand}</span>
            </span>
            <p className="text-sm text-ink/60">{verifying ? copy.confirmLead : copy.codeLead}</p>
            {verifying && session ? <p className="font-display text-xl">{session.displayName}</p> : null}
          </div>
          <PinPad
            value={pin}
            onChange={setPin}
            title={verifying ? copy.confirmTitle : copy.codeTitle}
            hint={hint}
            erase={copy.erase}
            disabled={busy}
          />
        </section>
      </main>
    );
  }

  const signals = (
    <FloorSignals
      lang={lang}
      role={session.role}
      tables={floorTables}
      onDecision={(orderId, status) => {
        if (session.role === "WAITER") {
          setMessage(status === "APPROVED" ? text(lang).cancelAccepted : text(lang).cancelRefused);
        }
        void tables().then((fresh) => setFloorTables(fresh.tables));
        if (picked?.table.openOrderId === orderId) {
          setOrderTick((current) => current + 1);
        }
      }}
    />
  );

  if (!picked) {
    return (
      <>
        {signals}
      <main className="flex h-dvh min-h-0 flex-col overflow-hidden">
        {message ? <p className="shrink-0 bg-accent/30 px-3 py-2 text-center">{message}</p> : null}
        <TableBoard
          lang={lang}
          person={session.displayName}
          role={session.role}
          tables={floorTables}
          pageStart={pageStart}
          onPage={setPageStart}
          onPick={(table, number) => {
            setMessage(null);
            setLines([]);
            setSent([]);
            setPicked({ table, number });
          }}
          onLeave={leave}
          onLang={switchLang}
          onAddTable={
            session.role === "CASHIER"
              ? () => {
                  const number = nextTableNumber(floorTables);
                  setAddingTable(true);
                  setMessage(null);
                  void createFloorTable({ id: newId(), label: String(number), zone: zoneForNumber(number), seats: 4 })
                    .then(async () => {
                      const fresh = await tables();
                      setFloorTables(fresh.tables);
                      setPageStart(pageStartFor(number));
                      setMessage(text(lang).tableAdded);
                    })
                    .catch(() => setMessage(text(lang).tableFailed))
                    .finally(() => setAddingTable(false));
                }
              : undefined
          }
          addingTable={addingTable}
          toolbar={session.role === "CASHIER" ? <ServiceRecette lang={lang} /> : null}
        />
      </main>
      </>
    );
  }

  return (
    <>
      {signals}
    <main className="flex h-dvh min-h-0 flex-col overflow-hidden">
      {message ? <p className="shrink-0 bg-accent/30 px-3 py-2 text-center">{message}</p> : null}
      <OrderDesk
        lang={lang}
        person={session.displayName}
        role={session.role}
        tableNumber={picked.number}
        serverName={serverName || session.displayName}
        categories={categories}
        lines={lines}
        sent={sent}
        specialIds={specialIds}
        onAdd={(product, quantity, note, stationKind) =>
          setLines((current) => {
            const index = current.findIndex((line) => line.productId === product.id && line.note === note);
            const existing = index >= 0 ? current[index] : undefined;
            if (existing) {
              const next = [...current];
              next[index] = { ...existing, quantity: Math.min(99, existing.quantity + quantity) };
              return next;
            }
            return [
              ...current,
              {
                key: newId(),
                productId: product.id,
                name: lang === "ar" ? product.nameAr : product.nameFr,
                priceMillimes: product.priceMillimes,
                quantity,
                note,
                stationKind,
              },
            ];
          })
        }
        onNote={(key, noteText) =>
          setLines((current) => current.map((line) => (line.key === key ? { ...line, note: noteText } : line)))
        }
        onRemove={(key) => setLines((current) => current.filter((line) => line.key !== key))}
        onBack={() => {
          setPicked(null);
          setLines([]);
        }}
        onValidate={() => {
          setJob({
            tableId: picked.table.id,
            openOrderId: picked.table.openOrderId,
            lines,
          });
          setPin("");
          setHint(null);
          setPinFor("send");
        }}
        onLeave={leave}
        onLang={switchLang}
        onBill={async () => {
          const orderId = picked.table.openOrderId;
          if (!orderId) {
            return;
          }
          await requestBill(orderId);
          const fresh = await tables();
          setFloorTables(fresh.tables);
        }}
        onPay={async (method, tendered) => {
          const orderId = picked.table.openOrderId;
          if (!orderId) {
            throw new Error("INVALID_TRANSITION");
          }
          const result = await pay(orderId, method, method === "CASH" ? tendered : undefined);
          const change = result.payment.changeMillimes;
          const notice = change !== null && change > 0 ? `${result.notice} · ${money(change)}` : result.notice;
          setLines([]);
          setSent([]);
          setPicked(null);
          setMessage(notice);
          const fresh = await tables();
          setFloorTables(fresh.tables);
          return notice;
        }}
        onCancelSent={async (itemId, reason) => {
          const orderId = picked.table.openOrderId;
          if (!orderId) {
            throw new Error("INVALID_TRANSITION");
          }
          await requestCancellation(orderId, itemId, reason);
        }}
      />
    </main>
    </>
  );
}
