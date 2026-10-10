import { Button } from "./ui/button.js";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"] as const;

export function PinPad({
  value,
  onChange,
  onSubmit,
  error,
  disabled = false,
  submitLabel,
  backspaceLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  error: boolean;
  disabled?: boolean;
  submitLabel: string;
  backspaceLabel: string;
}) {
  return (
    <div className="mx-auto grid w-full max-w-sm gap-3">
      <div
        data-testid="pin-dots"
        className={`flex min-h-14 items-center justify-center rounded-[14px] bg-surface text-3xl tracking-[0.4em] ${error ? "shake" : ""}`}
        aria-live="polite"
      >
        {"•".repeat(value.length)}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((key) => (
          <Button
            key={key}
            className="min-h-14 text-2xl"
            disabled={disabled || value.length >= 6}
            onClick={() => onChange(`${value}${key}`.slice(0, 6))}
          >
            {key}
          </Button>
        ))}
        <Button
          className="min-h-14"
          aria-label={backspaceLabel}
          disabled={disabled || value.length === 0}
          onClick={() => onChange(value.slice(0, -1))}
        >
          ⌫
        </Button>
        <Button
          intent="primary"
          className="col-span-2"
          disabled={disabled || value.length < 4}
          onClick={onSubmit}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
