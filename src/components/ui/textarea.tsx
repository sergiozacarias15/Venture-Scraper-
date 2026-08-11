import * as React from "react";
import { cn } from "../../lib/utils";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn(
        "flex min-h-28 w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-[16px] text-[#0C120F] shadow-sm outline-none transition placeholder:text-slate-400 hover:border-[#150A56]/45 focus:border-[#150A56] focus:ring-4 focus:ring-[#150A56]/10",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
