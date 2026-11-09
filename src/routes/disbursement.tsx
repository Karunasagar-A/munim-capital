import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Copy, Loader2, RefreshCw, Send, TriangleAlert } from "lucide-react";
import { AppShell, PageLoading, useRequireSession } from "@/components/app/AppShell";
import { AuditLog, KeyValue, Panel, RuleTable } from "@/components/app/bits";
import { Button } from "@/components/ui/button";
import { POLICY, emi, formatUsd } from "@/lib/bre";
import { disburseLoan, getPayoutStatus } from "@/lib/payout.functions";
import { getState, logEvent, updateLoan } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/disbursement")({
  head: () => ({
    meta: [
      { title: "Disbursement tracker — Munim Capital" },
      { name: "description", content: "Track your PayPal payout live: batch status, transaction ID and fees." },
      { property: "og:title", content: "Disbursement tracker — Munim Capital" },
      { property: "og:description", content: "Live PayPal payout tracking for your working capital loan." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DisbursementPage,
});

const TERMINAL = new Set(["SUCCESS", "DENIED", "CANCELED"]);

function DisbursementPage() {
  const { ready, state } = useRequireSession();
  const navigate = useNavigate();
  const disburse = useServerFn(disburseLoan);
  const status = useServerFn(getPayoutStatus);
  const started = useRef(false);
  const [polling, setPolling] = useState(false);
  const loan = state.loan;

  useEffect(() => {
    if (!ready) return;
    if (!loan) navigate({ to: "/apply" });
    else if (loan.status === "NEGOTIATING") navigate({ to: "/negotiate" });
    else if (loan.status === "REJECTED") navigate({ to: "/decision" });
  }, [ready, loan, navigate]);

  async function runPayout() {
    const s = getState();
    const l = s.loan;
    if (!l || l.apr == null) return;
    updateLoan((x) => ({ ...x, status: "DISBURSING" }));
    logEvent(`Requesting PayPal payout to ${s.financials.payoutEmail}`, "info");
    const res = await disburse({
      data: {
        loanId: l.id,
        apr: l.apr,
        recipientEmail: s.financials.payoutEmail,
        merchantName: s.ekyc.panName || s.session?.name || "Merchant",
        profile: {
          cibil: s.financials.cibil,
          vintageMonths: s.financials.vintageMonths,
          salesGrowthPct: s.financials.salesGrowthPct,
          monthlyTurnoverUsd: s.financials.monthlyTurnoverUsd,
          requestedAmountUsd: s.financials.requestedAmountUsd,
        },
      },
    }).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Network error" }));

    if (!res.ok) {
      updateLoan((x) => ({ ...x, status: "FAILED" }));
      logEvent(`Payout failed: ${res.error}`, "bad");
      toast.error("Payout failed", { description: res.error });
      return;
    }
    updateLoan((x) => ({
      ...x,
      payout: {
        senderBatchId: res.senderBatchId,
        payoutBatchId: res.payoutBatchId,
        batchStatus: res.batchStatus,
        amountUsd: res.amountUsd,
        receiver: s.financials.payoutEmail,
        fees: null,
        transactionId: null,
        transactionStatus: null,
        timeCompleted: null,
        error: null,
      },
    }));
    logEvent(`PayPal batch ${res.payoutBatchId} created · ${res.batchStatus}`, "ok");
    toast.success("Payout sent to PayPal");
  }

  // Auto-disburse on arrival for approved loans.
  useEffect(() => {
    if (!ready || !loan || started.current) return;
    if (loan.status === "APPROVED" && !loan.payout) {
      started.current = true;
      void runPayout();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, loan?.status]);

  // Poll PayPal for live batch status.
  const batchId = loan?.payout?.payoutBatchId;
  const batchStatus = loan?.payout?.batchStatus;
  useEffect(() => {
    if (!batchId || (batchStatus && TERMINAL.has(batchStatus))) {
      setPolling(false);
      return;
    }
    setPolling(true);
    let tries = 0;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      tries++;
      const r = await status({ data: { payoutBatchId: batchId } }).catch(() => null);
      if (stopped) return;
      if (r && r.ok) {
        const prev = getState().loan?.payout?.batchStatus;
        updateLoan((x) =>
          x.payout
            ? {
                ...x,
                status: r.batchStatus === "SUCCESS" ? "DISBURSED" : r.batchStatus === "DENIED" ? "FAILED" : x.status,
                payout: {
                  ...x.payout,
                  batchStatus: r.batchStatus,
                  fees: r.fees,
                  transactionId: r.transactionId,
                  transactionStatus: r.transactionStatus,
                  timeCompleted: r.timeCompleted,
                  error: r.itemError,
                },
              }
            : x,
        );
        if (prev !== r.batchStatus) {
          logEvent(
            `PayPal batch status → ${r.batchStatus}${r.transactionStatus ? ` · item ${r.transactionStatus}` : ""}${r.fees ? ` · fee ₹${r.fees}` : ""}`,
            r.batchStatus === "SUCCESS" ? "ok" : r.batchStatus === "DENIED" ? "bad" : "info",
          );
          if (r.batchStatus === "SUCCESS") toast.success("Funds disbursed!");
        }
        if (TERMINAL.has(r.batchStatus)) return;
      }
      if (tries < 30) timer = setTimeout(tick, 3000);
      else setPolling(false);
    };
    let timer = setTimeout(tick, 1500);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId, batchStatus]);

  if (!ready || !loan || loan.apr == null) return <PageLoading />;

  const f = state.financials;
  const p = loan.payout;
  const monthly = emi(f.requestedAmountUsd, loan.apr);
  const bs = p?.batchStatus;
  const stages = [
    { label: "Approved", done: true },
    { label: "Sent to PayPal", done: !!p },
    { label: "Processing", done: !!bs && bs !== "PENDING" },
    { label: "Disbursed", done: bs === "SUCCESS" },
  ];
  const failed = loan.status === "FAILED";

  return (
    <AppShell wide>
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className={cn("font-mono text-xs uppercase tracking-[0.2em]", failed ? "text-destructive" : "text-success")}>
            {loan.decision === "AUTO_APPROVED" ? "Auto-approved" : "Approved after negotiation"} · {loan.id}
          </p>
          <h1 className="mt-1 text-5xl">
            {bs === "SUCCESS"
              ? "Money's on its way."
              : failed
                ? "The payout hit a snag."
                : "Disbursing your capital…"}
          </h1>
        </div>
        <div className="text-right">
          <p className="font-display text-5xl leading-none">{formatUsd(f.requestedAmountUsd)}</p>
          <p className="font-mono text-sm text-muted-foreground">Paid in INR via PayPal</p>
        </div>
      </div>

      <ol className="mb-8 grid grid-cols-4 gap-2">
        {stages.map((s, i) => (
          <li key={s.label} className="space-y-2">
            <div className={cn("h-1.5 rounded-full transition-colors duration-500", s.done ? "bg-success" : failed && i > 0 ? "bg-destructive/40" : "bg-secondary")} />
            <p className={cn("flex items-center gap-1.5 text-xs font-semibold", s.done ? "text-foreground" : "text-muted-foreground")}>
              {s.done ? <CheckCircle2 className="size-3.5 text-success" /> : polling && stages[i - 1]?.done ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {s.label}
            </p>
          </li>
        ))}
      </ol>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel
          kicker="PayPal Payouts · sandbox"
          title="Transaction"
          action={
            <span
              className={cn(
                "rounded-full px-3 py-1 font-mono text-xs font-bold",
                bs === "SUCCESS" && "bg-success/15 text-success",
                (bs === "DENIED" || failed) && "bg-destructive/10 text-destructive",
                bs !== "SUCCESS" && bs !== "DENIED" && !failed && "bg-accent/25 text-accent-foreground",
              )}
            >
              {failed && !bs ? "FAILED" : (bs ?? "STARTING")}
            </span>
          }
        >
          {p ? (
            <>
              <CopyRow k="Payout batch ID" v={p.payoutBatchId} />
              <CopyRow k="Sender batch ID" v={p.senderBatchId} />
              <CopyRow k="Transaction ID" v={p.transactionId ?? (polling ? "Waiting for PayPal…" : "—")} />
              <KeyValue k="Item status" v={p.transactionStatus ?? "—"} mono />
              <KeyValue k="Recipient" v={p.receiver} />
              <KeyValue k="Amount" v={`${formatUsd(p.amountUsd ?? f.requestedAmountUsd)} INR`} mono />
              <KeyValue k="PayPal fee" v={p.fees ? `₹${p.fees}` : "—"} mono />
              <KeyValue k="Completed" v={p.timeCompleted ? new Date(p.timeCompleted).toLocaleString("en-IN") : "—"} />
              {p.transactionStatus === "UNCLAIMED" && (
                <p className="mt-4 rounded-lg bg-accent/15 p-3 text-xs text-accent-foreground">
                  This email has no PayPal sandbox account yet, so the funds are held as unclaimed until one is created.
                </p>
              )}
              {p.error && <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">{p.error}</p>}
            </>
          ) : failed ? (
            <div className="space-y-4">
              <p className="flex items-start gap-2 text-sm text-destructive">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                {loan.events.filter((e) => e.tone === "bad").at(-1)?.label ?? "PayPal didn't accept the payout."}
              </p>
              {loan.events.some((e) => e.label.includes("PAYOUT_NOT_AVAILABLE")) && (
                <p className="rounded-lg bg-accent/15 p-3 text-xs text-accent-foreground">
                  PayPal says the connected sandbox business account is in a country that can't send payouts (India,
                  for example). PayPal also only handles rupee (INR) balances inside India, so rupee payouts through
                  PayPal Payouts aren't available to this account.
                </p>
              )}
              <Button
                variant="ledger"
                onClick={() => {
                  updateLoan((x) => ({ ...x, status: "APPROVED" }));
                  void runPayout();
                }}
              >
                <RefreshCw /> Retry payout
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin text-primary" /> Getting a secure token and creating the payout batch…
            </div>
          )}
          {loan.status === "DISBURSING" && !p && !started.current && (
            <Button variant="outline" className="mt-4" onClick={() => void runPayout()}>
              <Send /> Resume payout
            </Button>
          )}
        </Panel>

        <div className="space-y-5">
          <Panel kicker="Approval breakdown" title={`${loan.apr}% APR`}>
            <KeyValue k="Principal" v={formatUsd(f.requestedAmountUsd)} />
            <KeyValue k="Rate" v={`${loan.apr}% APR${loan.decision === "AUTO_APPROVED" ? " (standard)" : " (negotiated)"}`} />
            <KeyValue k="Tenure" v={`${POLICY.tenureMonths} months`} />
            <KeyValue k="Monthly EMI" v={formatUsd(monthly)} />
            <KeyValue k="Total interest" v={formatUsd(monthly * POLICY.tenureMonths - f.requestedAmountUsd)} />
          </Panel>
          <Panel kicker="Rule engine" title="Checks">
            <RuleTable checks={loan.checks} />
          </Panel>
        </div>

        <Panel kicker="Audit trail" title="Loan log" className="lg:col-span-2">
          <AuditLog events={loan.events} />
        </Panel>
      </div>
    </AppShell>
  );
}

function CopyRow({ k, v }: { k: string; v: string }) {
  const copyable = /^[A-Z0-9-]{6,}$/.test(v);
  return (
    <KeyValue
      k={k}
      mono
      v={
        <span className="inline-flex items-center gap-2">
          {v}
          {copyable && (
            <button
              aria-label={`Copy ${k}`}
              className="text-muted-foreground hover:text-primary"
              onClick={() => {
                void navigator.clipboard.writeText(v);
                toast.success("Copied");
              }}
            >
              <Copy className="size-3.5" />
            </button>
          )}
        </span>
      }
    />
  );
}
