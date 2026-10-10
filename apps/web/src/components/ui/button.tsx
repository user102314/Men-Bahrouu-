import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "../../lib/cn.js";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-[12px] px-4 text-base font-medium transition disabled:opacity-50 min-h-12 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
  {
    variants: {
      intent: {
        primary: "min-h-14 bg-primary text-white",
        accent: "min-h-14 bg-accent text-ink",
        quiet: "bg-surface text-ink border border-line",
        danger: "bg-terracotta text-white",
      },
    },
    defaultVariants: { intent: "quiet" },
  },
);

export function Button({
  className,
  intent,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button type={type} className={cn(buttonVariants({ intent }), className)} {...props} />;
}
