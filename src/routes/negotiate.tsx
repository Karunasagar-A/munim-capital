import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Bot, FileSignature, Send, ShieldCheck } from "lucide-react";
import { AppShell, PageLoading, useRequireSession } from "@/components/app/AppShell";
import { KeyValue, Panel, RuleTable } from "@/components/app/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { POLICY, emi, formatInr, inrToUsd, negotiate } from "@/lib/bre";
import { logEvent, uid, updateLoan } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/negotiate")({
  head: () => ({
    meta: [
      { title: "Negotiate your rate — Munim Capital" },
      { name: "description", content: "Chat with our Risk Officer to agree an interest rate between 16% and 18% APR." },
      { property: "og:title", content: "Negotiate your rate — Munim Capital" },
      { property: "og:description", content: "Live rate negotiation with the Munim Capital Risk Officer." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NegotiatePage,
});

const QUICK = ["Can you offer 16%?", "How about 15%?", "17.5% works for me", "Accept the current offer"];

function NegotiatePage() {
  const { ready, state } = useRequireSession();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const [contractOpen, setContractOpen] = useState(false);
  const [agree, setAgree] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const loan = state.loan;

  useEffect(() => {
    if (!ready) return;
    if (!loan) navigate({ to: "/apply" });
    else if (loan.status !== "NEGOTIATING") navigate({ to: loan.status === "REJECTED" ? "/decision" : "/disbursement" });
  }, [ready, loan, navigate]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [loan?.chat.length, typing]);

  useEffect(() => {
    if (loan?.negotiation?.agreedApr != null && !typing) setContractOpen(true);
  }, [loan?.negotiation?.agreedApr, typing]);

  if (!ready || !loan || !loan.negotiation) return <PageLoading />;

  const neg = loan.negotiation;
  const agreed = neg.agreedApr;
  const amount = state.financials.requestedAmountInr;

  function send(msg: string) {
    const m = msg.trim();
    if (!m || typing || !loan?.negotiation) return;
    setText("");
    const at = new Date().toISOString();
    updateLoan((l) => ({ ...l, chat: [...l.chat, { id: uid(), from: "merchant", text: m, at }] }));
    setTyping(true);
    const result = negotiate(loan.negotiation, m);
    setTimeout(() => {
      updateLoan((l) => ({
        ...l,
        negotiation: result.state,
        chat: [...l.chat, { id: uid(), from: "bot", text: result.reply, at: new Date().toISOString() }],
      }));
      logEvent(
        `Negotiation · merchant: "${m}" → bot: ${result.state.agreedApr != null ? `accepted ${result.state.agreedApr}%` : `offer ${result.state.currentOffer}%`}`,
        result.state.agreedApr != null ? "ok" : "info",
      );
      setTyping(false);
    }, 900);
  }

  function acceptAndDisburse() {
    if (agreed == null) return;
    updateLoan((l) => ({ ...l, apr: agreed, status: "APPROVED" }));
    logEvent(`Contract signed at ${agreed}% APR — approved for disbursement`, "ok");
    navigate({ to: "/disbursement" });
  }

  const offer = agreed ?? neg.currentOffer;
  const meterPct = ((POLICY.baselineApr - offer) / (POLICY.baselineApr - POLICY.floorApr)) * 100;
  const monthly = emi(amount, offer);

  return (
    <AppShell wide>
      <div className="mb-8">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-warning-foreground">Negotiation required · {loan.id}</p>
        <h1 className="mt-1 text-5xl">Let's agree on your rate.</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="flex h-[620px] flex-col overflow-hidden rounded-2xl border bg-card shadow-ledger">
          <header className="flex items-center gap-3 border-b bg-secondary/50 px-5 py-3">
            <span className="grid size-10 place-items-center rounded-full bg-ledger text-primary-foreground">
              <Bot className="size-5" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-bold">Risk Officer</p>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-1.5 rounded-full bg-success" /> Automated · policy-bound
              </p>
            </div>
            <span className="rounded-full bg-accent/25 px-3 py-1 font-mono text-xs font-semibold text-accent-foreground">
              Offer {offer}% APR
            </span>
          </header>

          <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto bg-ruled px-5 py-6">
            {loan.chat.map((m) => (
              <div key={m.id} className={cn("flex animate-rise", m.from === "merchant" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-sm",
                    m.from === "merchant"
                      ? "rounded-br-sm bg-primary text-primary-foreground"
                      : "rounded-bl-sm border bg-card",
                    m.text.startsWith("Offer accepted") && "border-success/50 bg-success/10 font-semibold text-success",
                  )}
                >
                  {m.text}
                  <span className={cn("mt-1 block text-[10px] opacity-60")}>
                    {new Date(m.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            ))}
            {typing && (
              <div className="flex justify-start">
                <div className="flex gap-1 rounded-2xl rounded-bl-sm border bg-card px-4 py-3">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="size-1.5 animate-typing rounded-full bg-muted-foreground" style={{ animationDelay: `${i * 0.2}s` }} />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="border-t p-4">
            {agreed == null ? (
              <>
                <div className="mb-3 flex flex-wrap gap-2">
                  {QUICK.map((q) => (
                    <button
                      key={q}
                      onClick={() => send(q)}
                      disabled={typing}
                      className="rounded-full border bg-background px-3 py-1 text-xs font-medium hover:border-primary hover:text-primary disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    send(text);
                  }}
                  className="flex gap-2"
                >
                  <Input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Make a counter-offer, e.g. 16.5%"
                    className="h-11 bg-background"
                    aria-label="Message"
                  />
                  <Button type="submit" variant="ledger" className="h-11" disabled={typing || !text.trim()}>
                    <Send />
                  </Button>
                </form>
              </>
            ) : (
              <Button variant="marigold" size="lg" className="w-full" onClick={() => setContractOpen(true)}>
                <FileSignature /> Review contract at {agreed}% APR
              </Button>
            )}
          </div>
        </section>

        <aside className="space-y-5">
          <Panel kicker="Rate band" title={`${offer}% APR`}>
            <div className="relative h-3 rounded-full bg-secondary">
              <div className="absolute inset-y-0 left-0 rounded-full bg-marigold transition-all duration-500" style={{ width: `${Math.max(4, meterPct)}%` }} />
            </div>
            <div className="mt-2 flex justify-between font-mono text-[11px] text-muted-foreground">
              <span>Start {POLICY.baselineApr}%</span>
              <span>Floor {POLICY.floorApr}%</span>
            </div>
            <div className="mt-4">
              <KeyValue k="Principal" v={formatInr(amount)} />
              <KeyValue k="Payout" v={`$${inrToUsd(amount).toLocaleString("en-US")} USD`} />
              <KeyValue k={`EMI · ${POLICY.tenureMonths} months`} v={formatInr(monthly)} />
              <KeyValue k="Rounds" v={neg.rounds} />
            </div>
          </Panel>
          <Panel kicker="Why negotiation" title="Borderline signals">
            <RuleTable checks={loan.checks} />
          </Panel>
        </aside>
      </div>

      <Dialog open={contractOpen} onOpenChange={setContractOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-3xl font-normal">Loan agreement</DialogTitle>
            <DialogDescription>
              {state.ekyc.panName || state.session?.name} · Loan {loan.id}
            </DialogDescription>
          </DialogHeader>
          {agreed != null && (
            <div className="rounded-xl border bg-secondary/40 px-4 py-1">
              <KeyValue k="Principal" v={formatInr(amount)} />
              <KeyValue k="Agreed rate" v={`${agreed}% APR`} />
              <KeyValue k="Tenure" v={`${POLICY.tenureMonths} months`} />
              <KeyValue k="Monthly EMI" v={formatInr(emi(amount, agreed))} />
              <KeyValue k="Total repayable" v={formatInr(emi(amount, agreed) * POLICY.tenureMonths)} />
              <KeyValue k="Disbursed to" v={state.financials.payoutEmail} />
              <KeyValue k="PayPal amount" v={`$${inrToUsd(amount).toFixed(2)} USD`} mono />
            </div>
          )}
          <label className="flex items-start gap-3 text-sm">
            <Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} className="mt-0.5" />
            <span>I accept the loan terms and authorise Munim Capital to disburse funds to my PayPal account.</span>
          </label>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setContractOpen(false)}>
              Not yet
            </Button>
            <Button variant="marigold" size="lg" disabled={!agree} onClick={acceptAndDisburse}>
              <ShieldCheck /> Accept & Disburse
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
