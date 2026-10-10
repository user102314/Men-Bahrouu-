import { tunisTime } from "../lib/time.js";
import { Button } from "./ui/button.js";

export interface TicketLineView {
  id: string;
  name: string;
  quantity: number;
  note: string | null;
  sent: boolean;
  sentAt: string | null;
  voided: boolean;
  pendingCancel: boolean;
}

export function TicketPanel({
  lines,
  disabled,
  labels,
  onQuantity,
  onRemove,
  onNote,
  onCancel,
}: {
  lines: readonly TicketLineView[];
  disabled: boolean;
  labels: {
    decrease: string;
    increase: string;
    remove: string;
    note: string;
    cancel: string;
    locked: string;
    pending: string;
    empty: string;
  };
  onQuantity: (id: string, quantity: number) => void;
  onRemove: (id: string) => void;
  onNote: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  if (lines.length === 0) {
    return <p className="text-ink/70">{labels.empty}</p>;
  }
  return (
    <ul className="grid gap-3">
      {lines.map((line) => {
        const locked = line.sent || line.voided;
        return (
          <li
            key={line.id}
            className={`rounded-[14px] border border-line bg-fond p-3 ${line.voided ? "opacity-60 line-through" : ""}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg">{line.name}</p>
                {line.note ? <p className="text-sm text-ink/70">{line.note}</p> : null}
                {line.sent && line.sentAt ? (
                  <p className="text-sm text-olive">
                    {labels.locked} · {tunisTime(line.sentAt)}
                  </p>
                ) : null}
                {line.pendingCancel ? <p className="text-sm text-accent">{labels.pending}</p> : null}
              </div>
              <p className="text-xl tabular-nums">{line.quantity}</p>
            </div>
            {locked ? null : (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  aria-label={labels.decrease}
                  disabled={disabled || line.quantity <= 1}
                  onClick={() => onQuantity(line.id, line.quantity - 1)}
                >
                  −
                </Button>
                <Button
                  aria-label={labels.increase}
                  disabled={disabled}
                  onClick={() => onQuantity(line.id, line.quantity + 1)}
                >
                  +
                </Button>
                <Button aria-label={labels.remove} disabled={disabled} onClick={() => onRemove(line.id)}>
                  {labels.remove}
                </Button>
                <Button disabled={disabled} onClick={() => onNote(line.id)}>
                  {labels.note}
                </Button>
              </div>
            )}
            {line.sent && !line.voided && !line.pendingCancel ? (
              <Button className="mt-3" disabled={disabled} onClick={() => onCancel(line.id)}>
                {labels.cancel}
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
