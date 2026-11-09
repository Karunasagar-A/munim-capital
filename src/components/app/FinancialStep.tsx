import { useState } from "react";
import { toast } from "sonner";
import { Landmark, Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, KeyValue, Panel } from "@/components/app/bits";
import { ACCOUNT_RE, IFSC_RE, fetchCibil, pennyDrop } from "@/lib/kyc";
import { POLICY, formatInr } from "@/lib/bre";
import { setState, type AppState } from "@/lib/store";

type Fin = AppState["financials"];
const patch = (p: Partial<Fin>) => setState((s) => ({ ...s, financials: { ...s.financials, ...p } }));

const SCENARIOS: { label: string; tone: string; values: Partial<Fin> }[] = [
  { label: "Strong shop", tone: "Auto-approve", values: { cibil: 742, vintageMonths: 36, salesGrowthPct: 14, monthlyTurnoverInr: 450000, requestedAmountInr: 500000 } },
  { label: "Borderline shop", tone: "Negotiate", values: { cibil: 655, vintageMonths: 18, salesGrowthPct: 4, monthlyTurnoverInr: 280000, requestedAmountInr: 300000 } },
  { label: "New shop", tone: "Reject", values: { cibil: 590, vintageMonths: 4, salesGrowthPct: 2, monthlyTurnoverInr: 90000, requestedAmountInr: 200000 } },
];

export function financialErrors(f: Fin) {
  const e: Partial<Record<keyof Fin, string>> = {};
  if (!f.bankVerified) e.bankVerified = "Verify your bank account";
  if (!(f.cibil >= 300 && f.cibil <= 900)) e.cibil = "CIBIL score must be 300–900";
  if (!(f.vintageMonths >= 0)) e.vintageMonths = "Enter months in business";
  if (!Number.isFinite(f.salesGrowthPct)) e.salesGrowthPct = "Enter growth %";
  if (!(f.monthlyTurnoverInr > 0)) e.monthlyTurnoverInr = "Enter monthly turnover";
  if (!(f.requestedAmountInr > 0)) e.requestedAmountInr = "Enter an amount";
  else if (f.requestedAmountInr > POLICY.maxAmountInr) e.requestedAmountInr = "Maximum is ₹10,00,000";
  if (!/^\S+@\S+\.\S+$/.test(f.payoutEmail)) e.payoutEmail = "Enter the PayPal email to receive funds";
  return e;
}

const num = (v: string) => (v === "" ? 0 : Number(v));

export function FinancialStep({ state, showErrors }: { state: AppState; showErrors: boolean }) {
  const f = state.financials;
  const errs = showErrors ? financialErrors(f) : {};
  const [busyBank, setBusyBank] = useState(false);
  const [busyCibil, setBusyCibil] = useState(false);

  async function verifyBank() {
    setBusyBank(true);
    try {
      const r = await pennyDrop(f.accountNumber, f.ifsc, state.ekyc.panName || state.session?.name || "");
      patch({ bankVerified: true, bankName: r.bank, pennyDropUtr: r.utr });
      toast.success(`₹1 credited to your ${r.bank} account`, { description: `Name match: ${r.holder}` });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Penny drop failed");
    } finally {
      setBusyBank(false);
    }
  }

  async function pullCibil() {
    setBusyCibil(true);
    const score = await fetchCibil(state.ekyc.pan || state.session?.email || "X");
    setBusyCibil(false);
    patch({ cibil: score });
    toast.success(`Bureau score fetched: ${score}`);
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed bg-card/60 p-3">
        <span className="flex items-center gap-1.5 px-1 text-xs font-semibold text-muted-foreground">
          <Wand2 className="size-3.5" /> Demo profiles
        </span>
        {SCENARIOS.map((s) => (
          <button
            key={s.label}
            onClick={() => patch(s.values)}
            className="rounded-full border bg-background px-3 py-1 text-xs font-semibold hover:border-primary hover:text-primary"
          >
            {s.label} <span className="font-normal text-muted-foreground">· {s.tone}</span>
          </button>
        ))}
      </div>

      <Panel kicker="Penny drop · simulated" title="Bank account" done={f.bankVerified}>
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <Field label="Account number" htmlFor="acct" error={f.accountNumber && !ACCOUNT_RE.test(f.accountNumber) ? "9–18 digits" : errs.bankVerified}>
            <Input
              id="acct"
              inputMode="numeric"
              disabled={f.bankVerified}
              value={f.accountNumber}
              onChange={(e) => patch({ accountNumber: e.target.value.replace(/\D/g, "").slice(0, 18), bankVerified: false })}
              placeholder="50100123456789"
              className="h-11 bg-background font-mono"
            />
          </Field>
          <Field label="IFSC" htmlFor="ifsc" error={f.ifsc.length === 11 && !IFSC_RE.test(f.ifsc) ? "Format: HDFC0001234" : null}>
            <Input
              id="ifsc"
              disabled={f.bankVerified}
              value={f.ifsc}
              onChange={(e) => patch({ ifsc: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11), bankVerified: false })}
              placeholder="HDFC0001234"
              className="h-11 bg-background font-mono uppercase tracking-wider"
            />
          </Field>
          {!f.bankVerified && (
            <Button
              variant="ledger"
              size="lg"
              disabled={busyBank || !ACCOUNT_RE.test(f.accountNumber) || !IFSC_RE.test(f.ifsc)}
              onClick={verifyBank}
            >
              {busyBank ? <Loader2 className="animate-spin" /> : <Landmark />} Send ₹1
            </Button>
          )}
        </div>
        {f.bankVerified && (
          <div className="mt-4 rounded-xl bg-secondary/60 px-4 py-1">
            <KeyValue k="Bank" v={f.bankName} />
            <KeyValue k="Account" v={`•••• ${f.accountNumber.slice(-4)}`} mono />
            <KeyValue k="Penny-drop UTR" v={f.pennyDropUtr} mono />
          </div>
        )}
      </Panel>

      <Panel kicker="Business profile" title="Your numbers">
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="CIBIL score" htmlFor="cibil" error={errs.cibil} hint="300 – 900">
            <div className="flex gap-2">
              <Input
                id="cibil"
                type="number"
                min={300}
                max={900}
                value={f.cibil || ""}
                onChange={(e) => patch({ cibil: num(e.target.value) })}
                placeholder="720"
                className="h-11 bg-background font-mono"
              />
              <Button variant="outline" className="h-11" onClick={pullCibil} disabled={busyCibil}>
                {busyCibil && <Loader2 className="animate-spin" />} Fetch
              </Button>
            </div>
          </Field>
          <Field label="Shop vintage (months)" htmlFor="vintage" error={errs.vintageMonths} hint={f.vintageMonths ? `${Math.floor(f.vintageMonths / 12)} yr ${f.vintageMonths % 12} mo in business` : "How long the shop has been trading"}>
            <Input id="vintage" type="number" min={0} value={f.vintageMonths || ""} onChange={(e) => patch({ vintageMonths: num(e.target.value) })} placeholder="24" className="h-11 bg-background font-mono" />
          </Field>
          <Field label="Sales growth (YoY %)" htmlFor="growth" error={errs.salesGrowthPct}>
            <Input id="growth" type="number" step="0.1" value={f.salesGrowthPct || ""} onChange={(e) => patch({ salesGrowthPct: num(e.target.value) })} placeholder="12" className="h-11 bg-background font-mono" />
          </Field>
          <Field label="Monthly turnover (₹)" htmlFor="ta" error={errs.monthlyTurnoverInr} hint={f.monthlyTurnoverInr ? `${formatInr(f.monthlyTurnoverInr)} processed per month` : "Expected monthly sales / processing volume"}>
            <Input id="ta" type="number" min={0} value={f.monthlyTurnoverInr || ""} onChange={(e) => patch({ monthlyTurnoverInr: num(e.target.value) })} placeholder="350000" className="h-11 bg-background font-mono" />
          </Field>
        </div>
      </Panel>

      <Panel kicker="Disbursement" title="How much do you need?">
        <div className="grid gap-5 md:grid-cols-2">
          <Field
            label="Requested capital (₹)"
            htmlFor="amount"
            error={errs.requestedAmountInr}
            hint={f.requestedAmountInr ? `${formatInr(f.requestedAmountInr)} paid out in INR` : "Up to ₹10,00,000"}
          >
            <Input id="amount" type="number" min={1} max={POLICY.maxAmountInr} value={f.requestedAmountInr || ""} onChange={(e) => patch({ requestedAmountInr: num(e.target.value) })} placeholder="500000" className="h-12 bg-background font-mono text-lg" />
          </Field>
          <Field label="PayPal email for payout" htmlFor="ppemail" error={errs.payoutEmail} hint="Use a PayPal sandbox personal account to see the money arrive">
            <Input id="ppemail" type="email" value={f.payoutEmail} onChange={(e) => patch({ payoutEmail: e.target.value.trim() })} placeholder="sb-merchant@personal.example.com" className="h-12 bg-background" />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {[100000, 250000, 500000, 1000000].map((v) => (
            <button key={v} onClick={() => patch({ requestedAmountInr: v })} className="rounded-full border bg-background px-3 py-1 font-mono text-xs hover:border-primary">
              {formatInr(v)}
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}
