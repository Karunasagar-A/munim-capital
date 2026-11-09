import { Link, useNavigate, useHydrated } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { LogOut, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resetApplication, setState, useAppState, initialState } from "@/lib/store";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span className="grid size-8 place-items-center rounded-md bg-ledger font-display text-xl text-primary-foreground shadow-ledger">
        $
      </span>
      <span className="font-display text-2xl leading-none tracking-tight">
        Minimum <span className="italic text-primary">Capital</span>
      </span>
    </span>
  );
}

/** Redirects to sign-in once the browser state has loaded and there is no session. */
export function useRequireSession() {
  const hydrated = useHydrated();
  const state = useAppState();
  const navigate = useNavigate();
  useEffect(() => {
    if (hydrated && !state.session) navigate({ to: "/" });
  }, [hydrated, state.session, navigate]);
  return { ready: hydrated && !!state.session, state };
}

export function AppShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const state = useAppState();
  const navigate = useNavigate();
  const loan = state.loan;
  const loanTo =
    loan?.status === "REJECTED" || loan?.status === "REFERRED"
      ? "/decision"
      : loan?.status === "NEGOTIATING"
        ? "/negotiate"
        : "/disbursement";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <Link to="/apply">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-1 text-sm font-medium md:flex">
            <Link
              to="/apply"
              className="rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground"
              activeProps={{ className: "bg-secondary text-foreground" }}
            >
              Application
            </Link>
            {loan && (
              <Link
                to={loanTo}
                className="rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground"
                activeProps={{ className: "bg-secondary text-foreground" }}
              >
                Loan {loan.id}
              </Link>
            )}
          </nav>
          <div className="flex items-center gap-2">
            {state.session && (
              <span className="hidden text-sm text-muted-foreground sm:inline">{state.session.name}</span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                resetApplication(true);
                navigate({ to: "/apply" });
              }}
              title="Start a fresh application"
            >
              <RotateCcw /> <span className="hidden sm:inline">New application</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setState(() => initialState);
                navigate({ to: "/" });
              }}
            >
              <LogOut /> <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>
      <main className={`mx-auto px-5 py-10 ${wide ? "max-w-6xl" : "max-w-5xl"}`}>{children}</main>
      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        Demo environment · Identity checks are simulated · Payouts run on PayPal sandbox
      </footer>
    </div>
  );
}

export function PageLoading() {
  return (
    <div className="grid min-h-screen place-items-center bg-background">
      <div className="h-1 w-40 overflow-hidden rounded-full bg-secondary">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
      </div>
    </div>
  );
}
