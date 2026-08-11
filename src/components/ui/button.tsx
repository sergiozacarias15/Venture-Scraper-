import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#150A56]/20 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-[#FCEC62] text-[#150A56] shadow-lg shadow-[#150A56]/15 hover:-translate-y-0.5 hover:bg-[#FFBC7D]",
        outline:
          "border border-[#150A56]/25 bg-white text-[#150A56] hover:border-[#150A56] hover:bg-[#FCEC62]/20",
        ghost: "text-slate-600 hover:bg-slate-100 hover:text-[#150A56]",
      },
      size: {
        default: "h-12 px-6",
        sm: "h-10 rounded-lg px-4",
        lg: "h-14 px-8 text-base",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";
