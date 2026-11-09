import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Gavel } from "lucide-react";
import { AppShell, PageLoading, useRequireSession } from "@/components/app/AppShell";
import { KeyValue, Panel, StepDots } from "@/components/app/bits";
import { IdentityStep } from "@/components/app/IdentityStep";
import { FinancialStep, financialErrors } from "@/components/app/FinancialStep";
import { VideoKyc } from "@/components/app/VideoKyc";
import { Button } from "@/components/ui/button";
import { BOT_INTRO, POLICY, formatInr, initialNegotiation, underwrite } from "@/lib/bre";
import { setState, uid, type AppState, type AuditEvent, type Loan } from "@/lib/store";

export const Route = createFileRoute("/apply")({
  head: () => ({
    meta: [
      { title: "Apply for working capital — Munim Capital" },
      { name: "description", content: "Complete e-KYC, video KYC and your business profile to get an instant credit decision." },
      { property: "og:title", content: "Apply for working capital — Munim Capital" },
      { property: "og:description", content: "e-KYC, video KYC and business profile in one guided application." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ApplyPage,
});

const STEPS = ["Identity", "Video KYC", "Business", "Review"];

function stepDone(s: AppState) {
  return [
    s.ekyc.panVerified && s.ekyc.aadhaarVerified && s.ekyc.mobileVerified,
    s.vkyc.verified,
    Object.keys(financialErrors(s.financials)).length === 0,
    !!s.loan,
  ];
}

function ApplyPage() {
  const { ready, state } = useRequireSession();
  const navigate = useNavigate();
  const [step, setStep] = useState<number | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const done = stepDone(state);

  // Resume at the first incomplete step once saved progress has loaded.
  useEffect(() => {
    if (ready && step === null) {
      const first = done.findIndex((d) => !d);
      setStep(first === -1 ? 3 : Math.min(first, 3));
    }
  }, [ready, step, done]);

  if (!ready || step === null) return <PageLoading />;

  function next() {
    if (step === 2 && !done[2]) {
      setShowErrors(true);
      toast.error("A few details need attention");
      return;
    }
    setStep((s) => Math.min((s ?? 0) + 1, 3));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function submit() {
    const f = state.financials;
    const profile = {
      cibil: f.cibil,
      vintageMonths: f.vintageMonths,
      salesGrowthPct: f.salesGrowthPct,
      monthlyTurnoverInr: f.monthlyTurnoverInr,
      requestedAmountInr: f.requestedAmountInr,
    };
    const uw = underwrite(profile);
    const now = () => new Date().toISOString();
    const events: AuditEvent[] = [
      { at: now(), label: `PAN ${state.ekyc.pan} verified (NSDL)`, tone: "ok" },
      { at: now(), label: `Aadhaar XXXX${state.ekyc.aadhaarLast4} OTP verified`, tone: "ok" },
      { at: now(), label: `Mobile +91 ${state.ekyc.mobile} OTP verified`, tone: "ok" },
      { at: now(), label: `Video KYC liveness passed (${state.vkyc.mode})`, tone: "ok" },
      { at: now(), label: `Penny drop ${f.pennyDropUtr} · ${f.bankName}`, tone: "ok" },
      ...uw.checks.map((c) => ({ at: now(), label: `BRE · ${c.rule}: ${c.detail}`, tone: (c.passed ? "ok" : "warn") as AuditEvent["tone"] })),
      {
        at: now(),
        label: `Decision: ${uw.decision}`,
        tone: uw.decision === "AUTO_APPROVED" ? "ok" : uw.decision === "REJECTED" ? "bad" : "warn",
      },
    ];
    const loan: Loan = {
      id: uid("ML"),
      decision: uw.decision,
      reasons: uw.reasons,
      checks: uw.checks,
      apr: uw.apr,
      status: uw.decision === "AUTO_APPROVED" ? "APPROVED" : uw.decision === "REJECTED" ? "REJECTED" : "NEGOTIATING",
      negotiation: uw.decision === "NEGOTIATION_REQUIRED" ? initialNegotiation() : null,
      chat:
        uw.decision === "NEGOTIATION_REQUIRED"
          ? [{ id: uid(), from: "bot", text: BOT_INTRO, at: now() }]
          : [],
      payout: null,
      events,
      createdAt: now(),
    };
    setState((s) => ({ ...s, loan }));
    if (uw.decision === "AUTO_APPROVED") {
      toast.success("Approved instantly!", { description: `${POLICY.defaultApr}% APR · starting disbursement` });
      navigate({ to: "/disbursement" });
    } else if (uw.decision === "NEGOTIATION_REQUIRED") {
      toast.message("Let's talk rates", { description: "Your profile needs a quick negotiation." });
      navigate({ to: "/negotiate" });
    } else {
      navigate({ to: "/decision" });
    }
  }

  const f = state.financials;
  const canNext = step === 2 ? true : done[step];

  return (
    <AppShell>
      <div className="mb-8 space-y-5">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Application</p>
          <h1 className="mt-1 text-5xl">
            {["Confirm who you are", "A quick video check", "Tell us about the shop", "Review & submit"][step]}
          </h1>
        </div>
        <StepDots steps={STEPS} current={step} completed={done} />
      </div>

      {step === 0 && <IdentityStep state={state} />}

      {step === 1 && (
        <Panel kicker="V-KYC · liveness" title="Video KYC" done={state.vkyc.verified}>
          <VideoKyc
            verified={state.vkyc.verified}
            onVerified={(r) => {
              setState((s) => ({
                ...s,
                vkyc: { verified: true, completedAt: new Date().toISOString(), mode: r.mode, snapshot: r.snapshot },
              }));
              toast.success("Video KYC complete");
            }}
          />
        </Panel>
      )}

      {step === 2 && <FinancialStep state={state} showErrors={showErrors} />}

      {step === 3 && (
        <div className="grid gap-5 md:grid-cols-2">
          <Panel kicker="Identity" title={state.ekyc.panName || state.session?.name || "Merchant"} done>
            <KeyValue k="PAN" v={state.ekyc.pan} mono />
            <KeyValue k="Aadhaar" v={`XXXX XXXX ${state.ekyc.aadhaarLast4}`} mono />
            <KeyValue k="Mobile" v={`+91 ${state.ekyc.mobile}`} mono />
            <KeyValue
              k="Video KYC"
              v={
                <span className="inline-flex items-center gap-2">
                  {state.vkyc.snapshot && (
                    <img src={state.vkyc.snapshot} alt="Verification still" className="size-8 rounded-full object-cover" />
                  )}
                  Passed · {state.vkyc.mode}
                </span>
              }
            />
          </Panel>
          <Panel kicker="Business" title={formatInr(f.requestedAmountInr)}>
            <KeyValue k="Payout" v={`${formatInr(f.requestedAmountInr)} INR`} />
            <KeyValue k="CIBIL" v={f.cibil} />
            <KeyValue k="Vintage" v={`${f.vintageMonths} months`} />
            <KeyValue k="Sales growth" v={`${f.salesGrowthPct}%`} />
            <KeyValue k="Monthly turnover" v={formatInr(f.monthlyTurnoverInr)} />
            <KeyValue k="Bank" v={`${f.bankName} •••• ${f.accountNumber.slice(-4)}`} />
            <KeyValue k="PayPal" v={f.payoutEmail} />
          </Panel>
          <div className="md:col-span-2 flex flex-col items-start justify-between gap-4 rounded-2xl bg-ledger p-6 text-primary-foreground shadow-lift sm:flex-row sm:items-center">
            <div>
              <h3 className="text-3xl">Ready for a decision</h3>
              <p className="text-sm text-primary-foreground/75">
                Our rule engine checks your bureau score, vintage, growth and ticket size in seconds.
              </p>
            </div>
            <Button variant="marigold" size="lg" onClick={submit} disabled={!!state.loan}>
              <Gavel /> {state.loan ? "Already submitted" : "Submit for underwriting"}
            </Button>
          </div>
        </div>
      )}

      {step < 3 && (
        <div className="mt-8 flex items-center justify-between">
          <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => Math.max((s ?? 0) - 1, 0))}>
            <ArrowLeft /> Back
          </Button>
          <Button variant="ledger" size="lg" disabled={!canNext} onClick={next}>
            Continue <ArrowRight />
          </Button>
        </div>
      )}
      {step === 3 && (
        <Button variant="ghost" className="mt-6" onClick={() => setStep(2)}>
          <ArrowLeft /> Back
        </Button>
      )}
    </AppShell>
  );
}
