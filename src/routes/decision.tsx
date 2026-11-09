import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { RotateCcw, XCircle } from "lucide-react";
import { AppShell, PageLoading, useRequireSession } from "@/components/app/AppShell";
import { AuditLog, Panel, RuleTable } from "@/components/app/bits";
import { Button } from "@/components/ui/button";
import { resetApplication } from "@/lib/store";

export const Route = createFileRoute("/decision")({
  head: () => ({
    meta: [
      { title: "Credit decision — Munim Capital" },
      { name: "description", content: "See the policy rules behind your credit decision, with a full audit trail." },
      { property: "og:title", content: "Credit decision — Munim Capital" },
      { property: "og:description", content: "Transparent policy reasons and audit log for your application." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DecisionPage,
});

function DecisionPage() {
  const { ready, state } = useRequireSession();
  const navigate = useNavigate();
  const loan = state.loan;

  useEffect(() => {
    if (!ready) return;
    if (!loan) navigate({ to: "/apply" });
    else if (loan.status === "NEGOTIATING") navigate({ to: "/negotiate" });
    else if (loan.status !== "REJECTED") navigate({ to: "/disbursement" });
  }, [ready, loan, navigate]);

  if (!ready || !loan) return <PageLoading />;

  return (
    <AppShell>
      <div className="mb-8 flex items-start gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-destructive/10 text-destructive">
          <XCircle className="size-7" />
        </span>
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-destructive">Declined · {loan.id}</p>
          <h1 className="mt-1 text-5xl">We can't fund this application yet.</h1>
          <p className="mt-2 max-w-xl text-muted-foreground">
            This is a policy decision, not a judgement of your shop. Here is exactly which rules were not met.
          </p>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Panel kicker="Policy failures" title="Reasons">
          <ul className="space-y-3">
            {loan.reasons.map((r) => (
              <li key={r} className="flex gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm">
                <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" /> {r}
              </li>
            ))}
          </ul>
          <p className="mt-5 text-sm text-muted-foreground">
            You can reapply once your CIBIL score is at least 620 and your shop has traded for 6 months or more.
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => {
              resetApplication(true);
              navigate({ to: "/apply" });
            }}
          >
            <RotateCcw /> Start a new application
          </Button>
        </Panel>
        <Panel kicker="Rule engine" title="All checks">
          <RuleTable checks={loan.checks} />
        </Panel>
        <Panel kicker="Audit trail" title="Underwriting log" className="md:col-span-2">
          <AuditLog events={loan.events} />
        </Panel>
      </div>
    </AppShell>
  );
}
