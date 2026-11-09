import { createFileRoute, useNavigate, useHydrated } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, BadgeCheck, Mail, ShieldCheck, Smartphone, Zap } from "lucide-react";
import shopImg from "@/assets/merchant-shop.jpg";
import { Logo } from "@/components/app/AppShell";
import { Field, OtpField } from "@/components/app/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MOBILE_RE, sendOtp } from "@/lib/kyc";
import { setState, useAppState, type Session } from "@/lib/store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Munim Capital — Sign in for working capital" },
      {
        name: "description",
        content: "Sign in to apply for up to ₹10 lakh of working capital with instant KYC and same-day PayPal disbursement.",
      },
      { property: "og:title", content: "Munim Capital — Working capital for your shop" },
      {
        property: "og:description",
        content: "Instant KYC, transparent rules and same-day PayPal disbursement for micro-merchants.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const hydrated = useHydrated();
  const state = useAppState();

  function signIn(session: Session) {
    setState((s) => ({
      ...s,
      session,
      ekyc: { ...s.ekyc, mobile: session.mobile ?? s.ekyc.mobile },
      financials: { ...s.financials, payoutEmail: s.financials.payoutEmail || session.email },
    }));
    toast.success(`Welcome, ${session.name.split(" ")[0]}`);
    navigate({ to: "/apply" });
  }

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden lg:block">
        <img
          src={shopImg}
          alt="A shop owner smiling behind the counter of his grocery store"
          width={1024}
          height={1280}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-primary-deep via-primary-deep/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-12 text-primary-foreground">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">Working capital · up to ₹10 lakh</p>
          <h1 className="mt-3 max-w-lg text-6xl leading-[0.95]">
            Credit that keeps <em className="text-accent">your shelves</em> full.
          </h1>
          <div className="mt-8 grid max-w-lg grid-cols-3 gap-4 text-sm">
            {[
              { icon: Zap, t: "Decision in seconds" },
              { icon: ShieldCheck, t: "Video KYC at home" },
              { icon: BadgeCheck, t: "Same-day payout" },
            ].map(({ icon: Icon, t }) => (
              <div key={t} className="rounded-xl border border-primary-foreground/15 bg-primary-deep/50 p-3 backdrop-blur">
                <Icon className="mb-2 size-4 text-accent" />
                {t}
              </div>
            ))}
          </div>
        </div>
      </aside>

      <section className="flex flex-col bg-ruled px-6 py-10 sm:px-12">
        <Logo />
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <h2 className="text-5xl leading-none">Sign in to apply</h2>
          <p className="mt-3 text-muted-foreground">
            One application: identity, a short video check, your business numbers — then a decision.
          </p>

          {hydrated && state.session && (
            <button
              onClick={() => navigate({ to: "/apply" })}
              className="mt-6 flex w-full items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-left text-sm"
            >
              <span>
                Continue as <strong>{state.session.name}</strong>
              </span>
              <ArrowRight className="size-4 text-primary" />
            </button>
          )}

          <Tabs defaultValue="email" className="mt-8">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="email">
                <Mail className="mr-1.5 size-4" /> Email
              </TabsTrigger>
              <TabsTrigger value="otp">
                <Smartphone className="mr-1.5 size-4" /> Mobile OTP
              </TabsTrigger>
            </TabsList>
            <TabsContent value="email" className="mt-6">
              <EmailForm onDone={signIn} />
            </TabsContent>
            <TabsContent value="otp" className="mt-6">
              <OtpForm onDone={signIn} />
            </TabsContent>
          </Tabs>
          <p className="mt-6 text-xs text-muted-foreground">
            Demo mode: any email and a password of 6+ characters works. Your progress is kept on this device.
          </p>
        </div>
      </section>
    </div>
  );
}

function EmailForm({ onDone }: { onDone: (s: Session) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<Record<string, string>>({});

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.name = "Enter the name on your PAN card";
    if (!/^\S+@\S+\.\S+$/.test(email)) next.email = "Enter a valid email";
    if (password.length < 6) next.password = "At least 6 characters";
    setErr(next);
    if (Object.keys(next).length) return;
    onDone({ name: name.trim(), email: email.trim().toLowerCase(), method: "email" });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Full name (as on PAN)" error={err.name} htmlFor="name">
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ramesh Kumar" className="h-11 bg-card" />
      </Field>
      <Field label="Email" error={err.email} htmlFor="email">
        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@shop.in" className="h-11 bg-card" />
      </Field>
      <Field label="Password" error={err.password} htmlFor="password">
        <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 bg-card" />
      </Field>
      <Button type="submit" variant="ledger" size="lg" className="w-full">
        Sign in <ArrowRight />
      </Button>
    </form>
  );
}

function OtpForm({ onDone }: { onDone: (s: Session) => void }) {
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    if (name.trim().length < 2) return setErr("Enter your full name first");
    if (!MOBILE_RE.test(mobile)) return setErr("Enter a valid 10-digit Indian mobile number");
    setErr(null);
    setBusy(true);
    const code = await sendOtp();
    setBusy(false);
    setSent(code);
    toast.message(`Demo OTP for +91 ${mobile}`, { description: code, duration: 15000 });
  }

  function verify() {
    if (otp !== sent) return setErr("That code doesn't match. Check the demo OTP notification.");
    onDone({ name: name.trim(), email: `${mobile}@merchant.munim.demo`, mobile, method: "otp" });
  }

  return (
    <div className="space-y-4">
      <Field label="Full name (as on PAN)" htmlFor="oname">
        <Input id="oname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ramesh Kumar" className="h-11 bg-card" />
      </Field>
      <Field label="Mobile number" htmlFor="mobile" error={err}>
        <div className="flex">
          <span className="grid place-items-center rounded-l-md border border-r-0 bg-secondary px-3 font-mono text-sm">+91</span>
          <Input
            id="mobile"
            inputMode="numeric"
            value={mobile}
            onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
            placeholder="98765 43210"
            className="h-11 rounded-l-none bg-card font-mono"
          />
        </div>
      </Field>
      {sent ? (
        <div className="space-y-4">
          <Field label="6-digit code">
            <OtpField value={otp} onChange={setOtp} />
          </Field>
          <Button variant="ledger" size="lg" className="w-full" disabled={otp.length !== 6} onClick={verify}>
            Verify & sign in <ArrowRight />
          </Button>
        </div>
      ) : (
        <Button variant="ledger" size="lg" className="w-full" onClick={send} disabled={busy}>
          {busy ? "Sending…" : "Send OTP"}
        </Button>
      )}
    </div>
  );
}
