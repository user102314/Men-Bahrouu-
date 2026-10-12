import type { ReactNode } from "react";

import type { Lang } from "./copy.js";
import { text } from "./copy.js";
import { PAGE_SIZE, highestTableNumber, pageStarts, tableByNumber, type FloorTable } from "./tables.js";

export function TableBoard({
  lang,
  person,
  role,
  tables,
  pageStart,
  onPage,
  onPick,
  onLeave,
  onLang,
  onAddTable,
  addingTable,
  toolbar,
}: {
  lang: Lang;
  person: string;
  role: "WAITER" | "CASHIER";
  tables: FloorTable[];
  pageStart: number;
  onPage: (start: number) => void;
  onPick: (table: FloorTable, number: number) => void;
  onLeave: () => void;
  onLang: () => void;
  onAddTable?: (() => void) | undefined;
  addingTable?: boolean | undefined;
  toolbar?: ReactNode;
}) {
  const copy = text(lang);
  const numbers = Array.from({ length: PAGE_SIZE }, (_, index) => pageStart + index);
  const starts = pageStarts(tables);

  return (
    <div className="table-board">
      <header className="table-top">
        <div className="table-brand">
          <img src="/menbahrou.png" alt="Men Bahrouu" />
          <div className="min-w-0">
            <p>Men Bahrouu</p>
            <h1>{copy.chooseTable}</h1>
          </div>
        </div>
        <div className="table-actions">
          <button type="button" onClick={onLeave}>
            {copy.otherCode}
          </button>
          {onAddTable ? (
            <button type="button" disabled={addingTable} onClick={onAddTable}>
              {copy.addTable}
            </button>
          ) : null}
          <button type="button" onClick={onLang}>
            {copy.lang}
          </button>
        </div>
      </header>
      <footer className="table-meta">
        <div className="flex gap-2 overflow-x-auto">
          {starts.map((start) => (
            <button
              key={start}
              type="button"
              className={start === pageStart ? "page-tab is-on" : "page-tab"}
              onClick={() => onPage(start)}
            >
              {start} – {start + PAGE_SIZE - 1}
            </button>
          ))}
        </div>
        <div className="table-legend">
          <Legend swatch="bg-[#d7ebf8]" label={copy.free} />
          <Legend swatch="bg-[#f6c6d4]" label={copy.occupied} />
          <Legend swatch="bg-[#c8efc4]" label={copy.toPay} />
        </div>
      </footer>
      <p className="table-person">
        {person} · {role === "CASHIER" ? copy.cashier : copy.waiter}
      </p>
      {toolbar}
      <div className="table-grid">
        {numbers.map((number) => {
          const table = tableByNumber(tables, number);
          const status = table?.status ?? "NONE";
          return (
            <button
              key={number}
              type="button"
              disabled={!table}
              className={`flex flex-col items-center justify-center rounded-xl font-semibold disabled:opacity-40 ${tone(status)}`}
              onClick={() => {
                if (table) {
                  onPick(table, number);
                }
              }}
            >
              {number}
              <span className="text-[11px] font-medium">{statusLabel(status, copy)}</span>
            </button>
          );
        })}
      </div>
      <p className="sr-only">
        {copy.tables} 1 – {highestTableNumber(tables)}
      </p>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block h-4 w-4 rounded ${swatch}`} />
      {label}
    </span>
  );
}

function tone(status: FloorTable["status"] | "NONE"): string {
  if (status === "FREE") {
    return "bg-[#d7ebf8] text-ink";
  }
  if (status === "OCCUPIED") {
    return "bg-[#f6c6d4] text-ink";
  }
  if (status === "TO_PAY") {
    return "bg-[#c8efc4] text-ink";
  }
  return "bg-[#eef1f5] text-ink/35";
}

function statusLabel(
  status: FloorTable["status"] | "NONE",
  copy: ReturnType<typeof text>,
): string {
  if (status === "FREE") {
    return copy.free;
  }
  if (status === "OCCUPIED") {
    return copy.occupied;
  }
  if (status === "TO_PAY") {
    return copy.toPay;
  }
  return copy.closed;
}
