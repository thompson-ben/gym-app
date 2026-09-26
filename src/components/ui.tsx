"use client";

import Link from "next/link";
import { forwardRef, useEffect, useId, useRef, useSyncExternalStore, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconChevronLeft, IconX } from "./icons";
import { buttonClass, cx, inputClass, type ButtonSize, type ButtonVariant } from "./styles";

export { buttonClass, cx, inputClass };

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; busy?: boolean };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", busy, className, children, disabled, type = "button", ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass(variant, size, className)} disabled={disabled || busy} aria-busy={busy || undefined} {...props}>
      {busy ? <Spinner /> : null}
      {children}
    </button>
  );
});

export function IconButton({ label, className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-muted transition hover:bg-surface-2 hover:text-fg disabled:opacity-40",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx("inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent", className)}
    />
  );
}

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("rounded-3xl border border-line bg-surface", className)} {...props}>
      {children}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cx(inputClass, className)} {...props} />;
});

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: (id: string, describedBy?: string) => ReactNode;
}) {
  const id = useId();
  const hintId = hint || error ? `${id}-hint` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-muted">
        {label}
      </label>
      {children(id, hintId)}
      {error ? (
        <p id={hintId} className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-sm text-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const noopSubscribe = () => () => {};

/**
 * Bottom sheet (centred on wider screens). Rendered in a portal on <body> as a plain fixed
 * overlay rather than <dialog>, so layout is identical in every browser (iOS Safari included)
 * and nothing inherits styles from where the sheet is declared. Provides modal semantics:
 * focus moves in and is trapped, Escape closes, the page behind is inert and focus returns.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const node = panel.current;
    const focusables = () =>
      [...(node?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])];
    const first = focusables().find((el) => el.hasAttribute("autofocus")) ?? focusables()[1] ?? focusables()[0];
    (first ?? node)?.focus({ preventScroll: true });

    const siblings = [...document.body.children].filter((el) => el !== host.current && !el.hasAttribute("inert"));
    siblings.forEach((el) => el.setAttribute("inert", ""));
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
      } else if (e.key === "Tab") {
        const items = focusables();
        if (!items.length) return;
        const [a, z] = [items[0], items[items.length - 1]];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          z.focus();
        } else if (!e.shiftKey && document.activeElement === z) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      siblings.forEach((el) => el.removeAttribute("inert"));
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open || !isClient) return null;
  return createPortal(
    <div ref={host} className="fixed inset-0 z-50 flex items-end justify-center text-left sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-black/60" aria-hidden="true" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative max-h-[calc(100%-1.5rem)] w-full max-w-[34rem] overflow-y-auto overscroll-contain rounded-t-3xl border border-b-0 border-line bg-surface text-fg outline-none sm:max-h-full sm:rounded-3xl sm:border-b"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-surface px-5 pt-4 pb-2">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <IconButton label="Close" onClick={onClose} className="-mr-2">
            <IconX />
          </IconButton>
        </div>
        <div className="px-5 pb-4">{children}</div>
        {footer ? (
          <div className="sticky bottom-0 z-10 border-t border-line bg-surface px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">{footer}</div>
        ) : (
          <div className="pb-safe" />
        )}
      </div>
    </div>,
    document.body,
  );
}

export function PageHeader({
  title,
  eyebrow,
  back,
  action,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  back?: { href: string; label: string };
  action?: ReactNode;
}) {
  return (
    <header className="pt-safe">
      <div className="flex min-h-14 items-center justify-between gap-2 pt-2">
        {back ? (
          <Link href={back.href} className="-ml-2 inline-flex h-11 items-center gap-1 rounded-2xl pr-3 pl-1 text-sm text-muted hover:text-fg">
            <IconChevronLeft size={18} />
            {back.label}
          </Link>
        ) : (
          <span />
        )}
        {action}
      </div>
      <div className="pt-1 pb-5">
        {eyebrow ? <p className="mb-2 text-xs font-medium tracking-[0.18em] text-muted uppercase">{eyebrow}</p> : null}
        <h1 className="text-[32px] leading-[1.1] font-semibold tracking-[-0.03em]">{title}</h1>
      </div>
    </header>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-line px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children ? <div className="mx-auto mt-1.5 max-w-sm text-sm text-muted">{children}</div> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
      {children}
    </p>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-sm font-medium tracking-wide text-muted uppercase">{children}</h2>
      {action}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div>
        <label htmlFor={id} className="font-medium">
          {label}
        </label>
        {description ? <p className="text-sm text-muted">{description}</p> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx("relative h-8 w-13 shrink-0 rounded-full transition", checked ? "bg-accent" : "bg-surface-3")}
      >
        <span className={cx("absolute top-1 h-6 w-6 rounded-full transition-all", checked ? "left-6 bg-accent-ink" : "left-1 bg-fg/80")} />
      </button>
    </div>
  );
}
