const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

export function PinPad({
  value,
  onChange,
  title,
  hint,
  erase,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  title: string;
  hint: string | null;
  erase: string;
  disabled?: boolean;
}) {
  function press(digit: string): void {
    if (disabled || value.length >= 4) {
      return;
    }
    onChange(value + digit);
  }

  return (
    <div className="flex w-full flex-col items-center gap-4" dir="ltr">
      <h1 className="text-center font-display text-2xl text-ink min-[480px]:text-3xl">{title}</h1>
      {hint ? (
        <p className="text-center text-sm text-terracotta" role="alert">
          {hint}
        </p>
      ) : null}
      <div className="flex gap-3" aria-live="polite">
        {Array.from({ length: 4 }, (_, index) => (
          <span
            key={index}
            className={`size-4 rounded-full border-2 border-primary ${index < value.length ? "bg-primary" : "bg-transparent"}`}
          />
        ))}
      </div>
      <div className="pin-pad">
        {DIGITS.map((digit) => (
          <button key={digit} type="button" className="pin-key" disabled={disabled} onClick={() => press(digit)}>
            {digit}
          </button>
        ))}
        <span />
        <button type="button" className="pin-key" disabled={disabled} onClick={() => press("0")}>
          0
        </button>
        <button
          type="button"
          className="pin-key"
          aria-label={erase}
          disabled={disabled}
          onClick={() => onChange(value.slice(0, -1))}
        >
          ⌫
        </button>
      </div>
    </div>
  );
}
