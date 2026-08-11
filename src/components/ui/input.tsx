import * as React from "react";
import { cn } from "../../lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        "flex h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-[16px] text-[#0C120F] shadow-sm outline-none transition hover:border-[#150A56]/45 focus:border-[#150A56] focus:ring-4 focus:ring-[#150A56]/10 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = "Input";
