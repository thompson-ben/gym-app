import { cx } from "./styles";

export function Wordmark({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const text = size === "lg" ? "text-4xl" : size === "sm" ? "text-lg" : "text-2xl";
  return (
    <span className={cx("font-bold tracking-[-0.045em]", text, className)} aria-label="Splitmate">
      splitmate<span className="text-accent-text">.</span>
    </span>
  );
}
