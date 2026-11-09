import type { ReactNode } from "react";
import { CheckCircle2, Circle, XCircle, AlertTriangle, Info } from "lucide-react";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import type { AuditEvent } from "@/lib/store";
import type { RuleCheck } from "@/lib/bre";
import { cn } from "@/lib/utils";

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-[13px] font-semibold text-foreground">
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function Panel({
  title,
  kicker,
  done,
  children,
  className,
  action,
}: {
  title: string;
  kicker?: string;
  done?: boolean;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section
      className={cn(
        "animate-rise rounded-2xl border bg-card p-6 shadow-ledger",
        done && "border-success/40",
        className,
      )}
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          {kicker && (
            <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {kicker}
            </p>
          )}
          <h3 className="text-2xl">{title}</h3>
        </div>
        {action ?? (done ? <VerifiedBadge /> : null)}
      </div>
      {children}
    </section>
  );
}

export function VerifiedBadge({ label = "Verified" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-success/12 px-2.5 py-1 text-xs font-semibold text-success">
      <CheckCircle2 className="size-3.5" /> {label}
    </span>
  );
}

export function OtpField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <InputOTP maxLength={6} value={value} onChange={onChange} disabled={disabled}>
      <InputOTPGroup>
        {Array.from({ length: 6 }).map((_, i) => (
          <InputOTPSlot key={i} index={i} className="h-11 w-10 bg-card font-mono text-base" />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}

export function KeyValue({ k, v, mono }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-dashed py-2.5 last:border-0">
      <span className="text-sm text-muted-foreground">{k}</span>
      <span className={cn("text-right text-sm font-semibold tabular", mono && "font-mono text-[13px]")}>
        {v}
      </span>
    </div>
  );
}

export function RuleTable({ checks }: { checks: RuleCheck[] }) {
  return (
    <ul className="divide-y rounded-xl border bg-background/60">
      {checks.map((c) => (
        <li key={c.rule} className="flex items-start gap-3 px-4 py-3">
          {c.passed ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
          ) : (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold">{c.rule}</p>
            <p className="text-xs text-muted-foreground">{c.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

const toneIcon = {
  ok: <CheckCircle2 className="size-3.5 text-success" />,
  warn: <AlertTriangle className="size-3.5 text-warning-foreground" />,
  bad: <XCircle className="size-3.5 text-destructive" />,
  info: <Info className="size-3.5 text-muted-foreground" />,
};

export function AuditLog({ events }: { events: AuditEvent[] }) {
  return (
    <ol className="space-y-0 font-mono text-[12px]">
      {events.map((e, i) => (
        <li key={i} className="flex gap-3 border-b border-dashed py-2 last:border-0">
          <span className="shrink-0 text-muted-foreground tabular">
            {new Date(e.at).toLocaleTimeString("en-IN", { hour12: false })}
          </span>
          <span className="mt-0.5 shrink-0">{toneIcon[e.tone ?? "info"]}</span>
          <span className="text-foreground">{e.label}</span>
        </li>
      ))}
    </ol>
  );
}

export function StepDots({ steps, current, completed }: { steps: string[]; current: number; completed: boolean[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-2">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span
            className={cn(
              "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
              i === current && "border-primary bg-primary text-primary-foreground",
              i !== current && completed[i] && "border-success/40 bg-success/10 text-success",
              i !== current && !completed[i] && "text-muted-foreground",
            )}
          >
            {completed[i] && i !== current ? <CheckCircle2 className="size-3.5" /> : <Circle className="size-3.5" />}
            <span className="font-mono">{String(i + 1).padStart(2, "0")}</span> {s}
          </span>
          {i < steps.length - 1 && <span className="h-px w-5 bg-border" />}
        </li>
      ))}
    </ol>
  );
}
