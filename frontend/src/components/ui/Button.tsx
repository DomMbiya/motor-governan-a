import clsx from "clsx";
import { forwardRef } from "react";
import { Spinner } from "./Spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-petrol-600 text-white hover:bg-petrol-700 active:bg-petrol-800 disabled:bg-petrol-200",
  secondary: "border border-line-strong bg-white text-ink hover:border-petrol-600 hover:text-petrol-700 disabled:text-ink-faint disabled:hover:border-line-strong",
  ghost: "text-ink-soft hover:bg-paper-deep hover:text-ink disabled:text-ink-faint disabled:hover:bg-transparent",
  danger: "bg-nao text-white hover:brightness-95 disabled:opacity-50",
};
const SIZES: Record<Size, string> = { sm: "h-8 gap-1.5 px-2.5 text-[13px]", md: "h-10 gap-2 px-4 text-[14px]" };

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading = false, icon, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        "inline-flex shrink-0 select-none items-center justify-center rounded-md font-medium transition-colors disabled:cursor-not-allowed",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner className="h-4 w-4" /> : icon}
      {children}
    </button>
  );
});
