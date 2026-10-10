import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

export function Dialog({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 bg-ink/40" />
        <DialogPrimitive.Content
          className="fixed start-1/2 top-1/2 w-[min(32rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-[14px] bg-surface p-5 text-ink shadow-lg"
        >
          <DialogPrimitive.Title className="font-display text-2xl">{title}</DialogPrimitive.Title>
          <div className="mt-4">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
