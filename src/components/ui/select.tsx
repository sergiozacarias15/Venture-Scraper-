import * as React from "react";
import { cn } from "../../lib/utils";

export const Select = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "flex h-12 w-full appearance-none rounded-xl border border-slate-300 bg-white px-4 text-[16px] text-[#0C120F] shadow-sm outline-none transition hover:border-[#150A56]/45 focus:border-[#150A56] focus:ring-4 focus:ring-[#150A56]/10",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = "Select";
