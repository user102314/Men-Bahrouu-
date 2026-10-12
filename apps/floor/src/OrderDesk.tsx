import { tndToMillimes } from "@resto/shared";
import { useEffect, useState } from "react";

import { NOTE_PRESETS, text, type Lang } from "./copy.js";
import { hubOrigin, money, type CatalogCategory, type PublicOrder } from "./hub.js";
import { ProductMark } from "./ProductMark.js";
import { tunisStamp } from "./time.js";

export interface DraftLine {
  key: string;
  productId: string;
  name: string;
  priceMillimes: number;
  quantity: number;
  note: string | null;
  stationKind: "BAR" | "KITCHEN";
}

export function OrderDesk({
  lang,
  person,
  role,
  tableNumber,
  serverName,
  categories,
  lines,
  sent,
  specialIds,
  onAdd,
  onNote,
  onRemove,
  onBack,
  onValidate,
  onLeave,
  onLang,
  onBill,
  onPay,
  onCancelSent,
}: {
  lang: Lang;
  person: string;
  role: "WAITER" | "CASHIER";
  tableNumber: number;
  serverName: string;
  categories: CatalogCategory[];
  lines: DraftLine[];
  sent: PublicOrder["items"];
  specialIds: string[];
  onAdd: (
    product: CatalogCategory["products"][number],
    quantity: number,
    note: string | null,
    stationKind: "BAR" | "KITCHEN",
  ) => void;
  onNote: (key: string, note: string) => void;
  onRemove: (key: string) => void;
  onBack: () => void;
  onValidate: () => void;
  onLeave: () => void;
  onLang: () => void;
  onBill: () => Promise<void>;
  onPay: (method: "CASH" | "CARD", tenderedMillimes?: number) => Promise<string>;
  onCancelSent: (itemId: string, reason: string) => Promise<void>;
}) {
  const copy = text(lang);
  const [categoryId, setCategoryId] = useState("all");
  const [group, setGroup] = useState<"ALL" | "BAR" | "KITCHEN">("ALL");
  const [selected, setSelected] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [qty, setQty] = useState("");
  const [selectedSent, setSelectedSent] = useState<string | null>(null);
  const [pendingSent, setPendingSent] = useState<string[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [payMethod, setPayMethod] = useState<"CASH" | "CARD" | null>(null);
  const [tenderedText, setTenderedText] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelText, setCancelText] = useState("");
  const [busy, setBusy] = useState(false);
  const [slipAt, setSlipAt] = useState<string | null>(null);
  const selectedLine = lines.find((line) => line.key === selected) ?? null;
  useEffect(() => {
    setPendingSent([]);
  }, [sent]);
  useEffect(() => {
    if (!slipAt) {
      return;
    }
    window.print();
    setSlipAt(null);
  }, [slipAt]);
  const specials = new Set(specialIds);
  const grouped = group === "ALL" ? categories : categories.filter((category) => category.stationKind === group);
  const visible =
    categoryId === "daily"
      ? grouped
          .map((category) => ({ ...category, products: category.products.filter((product) => specials.has(product.id)) }))
          .filter((category) => category.products.length > 0)
      : categoryId === "all" || !grouped.some((category) => category.id === categoryId)
        ? grouped
        : grouped.filter((category) => category.id === categoryId);
  const typedQty = qty.length === 0 ? 1 : Math.min(99, Number(qty));
  const draftTotal = lines.reduce((sum, line) => sum + line.priceMillimes * line.quantity, 0);
  const activeSent = sent.filter((item) => item.status === "ACTIVE");
  const sentTotal = activeSent.reduce((sum, item) => sum + item.unitPriceMillimes * item.quantity, 0);
  const payable = activeSent
    .filter((item) => item.sentAt !== null)
    .reduce((sum, item) => sum + item.unitPriceMillimes * item.quantity, 0);
  let tendered: number | null = null;
  try {
    tendered = tenderedText.trim().length === 0 ? null : tndToMillimes(tenderedText);
  } catch {
    tendered = null;
  }
  const change = tendered === null ? null : tendered - payable;

  return (
    <>
    <div className="pos-shell">
      <aside className="pos-ticket">
        <div className="shrink-0 border-b border-line px-3 py-2">
          <p className="text-xs text-ink/60">
            {person} · {role === "CASHIER" ? copy.cashier : copy.waiter}
          </p>
          <p className="font-display text-4xl leading-none font-semibold tabular-nums">{money(draftTotal + sentTotal)}</p>
          <p className="mt-1 text-sm">
            {copy.tables} {tableNumber}
          </p>
        </div>
        <ul className="min-h-0 flex-1 overflow-auto">
          {activeSent.map((item) => (
            <li key={item.id} className="border-b border-line">
              <button
                type="button"
                className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-2 px-3 py-2 text-start ${selectedSent === item.id ? "bg-[#f6c6d4]" : "bg-surface"}`}
                onClick={() => {
                  setSelected(null);
                  setSelectedSent(item.id);
                  setHint(null);
                }}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold uppercase">{item.productNameSnapshot}</span>
                  <span className="text-xs text-ink/60">
                    {item.quantity} × {money(item.unitPriceMillimes)}
                    {item.note ? ` · ${item.note}` : ""}
                  </span>
                  <span className={`mt-0.5 inline-block text-[11px] ${pendingSent.includes(item.id) ? "text-terracotta" : "text-olive"}`}>
                    {pendingSent.includes(item.id) ? copy.cancelAsked : copy.sent}
                  </span>
                </span>
                <span className="text-sm font-semibold tabular-nums">{money(item.unitPriceMillimes * item.quantity)}</span>
              </button>
            </li>
          ))}
          {lines.map((line) => (
            <li key={line.key} className="border-b border-line">
              <button
                type="button"
                className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-2 px-3 py-2 text-start ${selected === line.key ? "bg-[#d7ebf8]" : "bg-surface"}`}
                onClick={() => {
                  setSelectedSent(null);
                  setSelected(line.key);
                  setHint(null);
                }}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold uppercase">{line.name}</span>
                  <span className="text-xs text-ink/60">
                    {line.quantity} × {money(line.priceMillimes)} · {copy.added}
                    {line.note ? ` · ${line.note}` : ""}
                  </span>
                </span>
                <span className="text-sm font-semibold tabular-nums">{money(line.priceMillimes * line.quantity)}</span>
              </button>
            </li>
          ))}
          {lines.length === 0 && sent.length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-ink/50">{copy.emptyTicket}</li>
          ) : null}
        </ul>
        <div className="flex shrink-0 items-center justify-between border-t border-line px-3 py-2 text-sm font-semibold">
          <span>{copy.total}</span>
          <span className="tabular-nums">{money(draftTotal + sentTotal)}</span>
        </div>
      {hint ? <p className="shrink-0 px-3 text-sm text-terracotta">{hint}</p> : null}
      {noteOpen ? (
        <div className="note-panel shrink-0 border-t border-line bg-surface p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="font-semibold">{copy.noteTitle}</p>
            <button
              type="button"
              className="flex size-10 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-xl leading-none"
              aria-label={copy.close}
              onClick={() => setNoteOpen(false)}
            >
              ×
            </button>
          </div>
          <p className="mb-2 text-sm text-ink/70">
            {selectedLine
              ? selectedLine.stationKind === "BAR"
                ? copy.noteToBar
                : copy.noteToKitchen
              : copy.noteThenProduct}
          </p>
          <div className="mb-2 flex flex-wrap gap-2">
            {NOTE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="min-h-12 rounded-md bg-accent px-3 font-semibold text-white"
                onClick={() => setNoteDraft(preset.fr)}
              >
                {lang === "ar" ? preset.ar : preset.fr}
              </button>
            ))}
          </div>
          <input
            className="mb-2 min-h-12 w-full rounded-md border border-line px-3"
            value={noteDraft}
            maxLength={120}
            onChange={(event) => setNoteDraft(event.target.value)}
          />
          <button
            type="button"
            className="min-h-12 rounded-md bg-primary px-4 text-white disabled:opacity-40"
            disabled={noteDraft.trim().length === 0}
            onClick={() => {
              const written = noteDraft.trim();
              if (written.length === 0) {
                return;
              }
              if (!selected) {
                setHint(copy.noteTouchProduct);
                return;
              }
              onNote(selected, written);
              setNoteOpen(false);
              setHint(selectedLine?.stationKind === "BAR" ? copy.noteToBar : copy.noteToKitchen);
            }}
          >
            {copy.confirmNote}
          </button>
        </div>
      ) : null}
      {cancelOpen ? (
        <div className="note-panel shrink-0 border-t border-line bg-surface p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="font-semibold">{copy.cancelReason}</p>
            <button
              type="button"
              className="flex size-10 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-xl leading-none"
              aria-label={copy.close}
              onClick={() => setCancelOpen(false)}
            >
              ×
            </button>
          </div>
          <input
            className="mb-2 min-h-12 w-full rounded-md border border-line px-3"
            value={cancelText}
            maxLength={200}
            onChange={(event) => setCancelText(event.target.value)}
          />
          <button
            type="button"
            className="min-h-12 rounded-md bg-[#c8452d] px-4 text-white disabled:opacity-40"
            disabled={busy || cancelText.trim().length < 3 || (!selectedSent && !selected)}
            onClick={() => {
              const reason = cancelText.trim();
              if (reason.length < 3 || (!selectedSent && !selected)) {
                setHint(copy.cancelNeedReason);
                return;
              }
              if (!selectedSent && selected) {
                onRemove(selected);
                setSelected(null);
                setCancelOpen(false);
                return;
              }
              if (!selectedSent) {
                return;
              }
              const itemId = selectedSent;
              setBusy(true);
              void onCancelSent(itemId, reason)
                .then(() => {
                  setPendingSent((current) => (current.includes(itemId) ? current : [...current, itemId]));
                  setCancelOpen(false);
                  setSelectedSent(null);
                  setHint(copy.cancelAsked);
                })
                .catch((error: unknown) => setHint(actionError(error, copy)))
                .finally(() => setBusy(false));
            }}
          >
            {selectedSent ? copy.askCancel : copy.remove}
          </button>
        </div>
      ) : null}
      {role === "CASHIER" ? (
        <div className="grid shrink-0 gap-2 border-t border-line bg-surface p-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="min-h-12 rounded-md bg-olive font-semibold text-white"
              onClick={() => {
                setBusy(true);
                void onBill()
                  .then(() => {
                    setHint(copy.billDone);
                    setSlipAt(tunisStamp(new Date()));
                  })
                  .catch((error: unknown) => setHint(actionError(error, copy)))
                  .finally(() => setBusy(false));
              }}
            >
              {copy.addition}
            </button>
            <button
              type="button"
              className={`min-h-12 rounded-md font-semibold text-white ${payOpen ? "bg-ink ring-2 ring-accent" : "bg-[#0c4f8a]"}`}
              onClick={() => {
                setPayOpen((open) => !open);
                setPayMethod(null);
                setHint(lines.length > 0 ? copy.payNeedSend : null);
              }}
            >
              {copy.pay}
            </button>
          </div>
          {payOpen ? (
            <div className="grid gap-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={`min-h-12 rounded-md font-semibold text-white ${payMethod === "CASH" ? "bg-ink ring-2 ring-accent" : "bg-olive"}`}
                  onClick={() => {
                    setPayMethod("CASH");
                    setTenderedText(tndDraft(payable));
                  }}
                >
                  {copy.cash}
                </button>
                <button
                  type="button"
                  className={`min-h-12 rounded-md font-semibold text-white ${payMethod === "CARD" ? "bg-ink ring-2 ring-accent" : "bg-accent"}`}
                  onClick={() => setPayMethod("CARD")}
                >
                  {copy.card}
                </button>
              </div>
              {payMethod === "CASH" ? (
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
                  <label className="grid gap-1 text-sm">
                    {copy.tendered}
                    <input
                      className="min-h-12 rounded-md border border-line px-3 text-xl tabular-nums"
                      inputMode="decimal"
                      value={tenderedText}
                      onChange={(event) => setTenderedText(event.target.value)}
                    />
                  </label>
                  <p className={`pb-3 ${change !== null && change >= 0 ? "text-olive" : "text-terracotta"}`}>
                    {copy.change} {change !== null && change >= 0 ? money(change) : "—"}
                  </p>
                </div>
              ) : null}
              <button
                type="button"
                className="min-h-14 rounded-md bg-primary text-lg font-semibold text-white disabled:opacity-40"
                disabled={busy || !payMethod || lines.length > 0 || payable <= 0 || (payMethod === "CASH" && (tendered === null || change === null || change < 0))}
                onClick={() => {
                  if (!payMethod || (payMethod === "CASH" && (tendered === null || change === null || change < 0))) {
                    return;
                  }
                  setBusy(true);
                  void onPay(payMethod, payMethod === "CASH" ? (tendered ?? undefined) : undefined).catch((error: unknown) => {
                    setHint(actionError(error, copy));
                    setBusy(false);
                  });
                }}
              >
                {copy.confirmPay}
              </button>
              <p className="text-sm">{copy.nonFiscal}</p>
            </div>
          ) : null}
        </div>
      ) : null}
      <footer className="grid shrink-0 grid-cols-4 gap-1 border-t border-line bg-surface p-1">
        <button type="button" className="min-h-11 rounded-md bg-[#e7ebf0] text-sm font-semibold" onClick={onBack}>
          {copy.back}
        </button>
        <button
          type="button"
          className="min-h-11 rounded-md bg-[#e7ebf0] text-sm font-semibold"
          onClick={() => {
            setNoteDraft(selectedLine?.note ?? "");
            setHint(null);
            setNoteOpen(true);
          }}
        >
          {copy.note}
        </button>
        <button
          type="button"
          className="min-h-11 rounded-md bg-[#f6c6d4] text-sm font-semibold"
          onClick={() => {
            if (selected) {
              onRemove(selected);
              setSelected(null);
              setHint(null);
              return;
            }
            if (selectedSent) {
              setCancelText(copy.cancelDefault);
              setCancelOpen(true);
              setHint(null);
              return;
            }
            setHint(copy.pickLine);
          }}
        >
          {role === "CASHIER" ? copy.suppress : copy.remove}
        </button>
        <button
          type="button"
          className="min-h-11 rounded-md bg-primary text-sm font-semibold text-white disabled:opacity-40"
          disabled={lines.length === 0}
          onClick={onValidate}
        >
          {copy.validate}
        </button>
      </footer>
        <div className="shrink-0 border-t border-line bg-surface p-2">
          <p className="mb-1 text-center text-xs text-ink/60">
            {copy.qty} <span className="text-lg font-semibold text-ink tabular-nums">{typedQty}</span>
          </p>
          <div className="keypad-keys">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"].map((key) => (
              <button
                key={key}
                type="button"
                className={`rounded-md border border-line bg-[#f4f6f8] text-lg font-semibold text-ink ${key === "C" ? "text-terracotta" : ""}`}
                onClick={() => {
                  if (key === "C") {
                    setQty("");
                    return;
                  }
                  if (key === "⌫") {
                    setQty((current) => current.slice(0, -1));
                    return;
                  }
                  setQty((current) => {
                    const next = `${current}${key}`.replace(/^0+/, "");
                    return next.length > 2 ? current : next;
                  });
                }}
              >
                {key}
              </button>
            ))}
          </div>
        </div>
      </aside>
      <section className="pos-board">
        <header className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-line bg-surface px-2 py-2">
          <button type="button" className="min-h-11 rounded-md bg-[#e7ebf0] px-3 text-sm font-semibold" onClick={onBack}>
            {copy.back}
          </button>
          <GroupButton
            active={group === "BAR"}
            label={copy.bar}
            onClick={() => {
              setGroup("BAR");
              setCategoryId("all");
            }}
          />
          <GroupButton
            active={group === "KITCHEN"}
            label={copy.kitchen}
            onClick={() => {
              setGroup("KITCHEN");
              setCategoryId("all");
            }}
          />
          <GroupButton
            active={group === "ALL"}
            label={copy.all}
            onClick={() => {
              setGroup("ALL");
              setCategoryId("all");
            }}
          />
          <button type="button" className="ms-auto min-h-11 rounded-md bg-[#e7ebf0] px-3 text-sm font-semibold" onClick={onLang}>
            {copy.lang}
          </button>
          <button type="button" className="min-h-11 rounded-md bg-[#e7ebf0] px-3 text-sm font-semibold" onClick={onLeave}>
            {copy.otherCode}
          </button>
        </header>
        <div className="pos-catalog">
          <nav className="pos-cats">
            <GroupButton active={categoryId === "daily"} label={copy.daily} onClick={() => setCategoryId("daily")} />
            <GroupButton active={categoryId === "all"} label={copy.all} onClick={() => setCategoryId("all")} />
            {grouped.map((category) => (
              <GroupButton
                key={category.id}
                active={categoryId === category.id}
                label={lang === "ar" ? category.nameAr : category.nameFr}
                onClick={() => setCategoryId(category.id)}
              />
            ))}
          </nav>
          <div className="min-h-0 flex-1 overflow-auto p-2">
          {categoryId === "daily" && visible.length === 0 ? <p className="p-4 text-lg">{copy.dailyEmpty}</p> : null}
          {visible.map((category) => (
            <div key={category.id} className="mb-3">
              <h2 className="mb-2 text-xs font-semibold tracking-wide text-ink/50 uppercase">
                {lang === "ar" ? category.nameAr : category.nameFr}
              </h2>
              <div className="product-grid">
                {category.products.map((product) => {
                  const count = lines
                    .filter((line) => line.productId === product.id)
                    .reduce((sum, line) => sum + line.quantity, 0);
                  return (
                    <button
                      key={product.id}
                      type="button"
                      disabled={!product.isAvailable}
                      className={`relative overflow-hidden rounded-md border bg-surface text-center font-semibold disabled:opacity-40 ${
                        specials.has(product.id) ? "border-primary ring-2 ring-primary" : "border-line"
                      }`}
                      onClick={() => {
                        const written = noteOpen ? noteDraft.trim() : "";
                        onAdd(product, typedQty, written.length > 0 ? written : null, category.stationKind);
                        setQty("");
                        if (written.length > 0) {
                          setNoteDraft("");
                          setNoteOpen(false);
                          setHint(category.stationKind === "BAR" ? copy.noteToBar : copy.noteToKitchen);
                        }
                      }}
                    >
                      <span className="absolute end-1 top-1 z-10 rounded bg-[#e8f2fb] px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                        {money(product.priceMillimes)}
                      </span>
                      {product.imageUrl ? (
                        <img
                          src={`${hubOrigin()}${product.imageUrl}`}
                          alt=""
                          className="h-20 w-full object-cover"
                        />
                      ) : (
                        <ProductMark name={`${product.nameFr} ${product.nameAr}`} />
                      )}
                      <span className="block px-2 py-2 text-xs leading-tight font-semibold uppercase">
                        {lang === "ar" ? product.nameAr : product.nameFr}
                      </span>
                      {count > 0 || specials.has(product.id) ? (
                        <span className="block px-2 pb-2 text-[11px] text-primary">
                          {specials.has(product.id) ? copy.daily : ""}
                          {count > 0 ? `${specials.has(product.id) ? " · " : ""}×${count}` : ""}
                        </span>
                      ) : null}
                      {product.isAvailable ? null : <span className="block px-2 pb-2 text-xs">{copy.unavailable}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          </div>
        </div>
      </section>
    </div>
      <section className="addition-sheet slip">
        <p className="slip-brand">{copy.brand}</p>
        <h1>{copy.addition}</h1>
        <p className="slip-meta">
          {copy.tables} {tableNumber}
          <br />
          {serverName}
          <br />
          {slipAt}
        </p>
        <div className="slip-rule" />
        {activeSent.map((item) => (
          <div key={item.id}>
            <div className="slip-row">
              <span>{item.quantity}×</span>
              <span className="slip-name">{item.productNameSnapshot}</span>
              <span>{money(item.unitPriceMillimes * item.quantity)}</span>
            </div>
            {item.note ? <p className="slip-note-line">{item.note}</p> : null}
          </div>
        ))}
        {lines.map((line) => (
          <div key={line.key}>
            <div className="slip-row">
              <span>{line.quantity}×</span>
              <span className="slip-name">
                {line.name} · {copy.added}
              </span>
              <span>{money(line.priceMillimes * line.quantity)}</span>
            </div>
            {line.note ? <p className="slip-note-line">{line.note}</p> : null}
          </div>
        ))}
        <div className="slip-rule" />
        <p className="slip-total">
          <span>{copy.total}</span>
          <span>{money(draftTotal + sentTotal)}</span>
        </p>
        <p className="slip-foot">{copy.nonFiscal}</p>
      </section>
    </>
  );
}

function tndDraft(amount: number): string {
  const whole = Math.floor(amount / 1000);
  const fraction = String(amount % 1000).padStart(3, "0").replace(/0+$/, "");
  return fraction.length === 0 ? String(whole) : `${whole},${fraction}`;
}

function actionError(error: unknown, copy: ReturnType<typeof text>): string {
  const code = error instanceof Error ? error.message : "";
  if (code === "INVALID_TRANSITION") {
    return copy.payNeedSend;
  }
  if (code === "CANCELLATION_EXISTS") {
    return copy.cancelAsked;
  }
  if (code === "ALREADY_PAID") {
    return copy.alreadyPaid;
  }
  return copy.payFailed;
}

function GroupButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`min-h-11 shrink-0 rounded-md border px-2 text-sm font-semibold whitespace-nowrap ${
        active ? "border-primary bg-[#d7ebf8] text-ink ring-2 ring-primary" : "border-line bg-surface text-ink"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
