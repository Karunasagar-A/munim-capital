import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, KeyValue, OtpField, Panel } from "@/components/app/bits";
import { AADHAAR_RE, MOBILE_RE, PAN_RE, maskPan, sendOtp, verifyPanNsdl } from "@/lib/kyc";
import { setState, type AppState } from "@/lib/store";

const patchEkyc = (p: Partial<AppState["ekyc"]>) => setState((s) => ({ ...s, ekyc: { ...s.ekyc, ...p } }));

export function IdentityStep({ state }: { state: AppState }) {
  const { ekyc, session } = state;
  return (
    <div className="grid gap-5">
      <PanCard pan={ekyc.pan} verified={ekyc.panVerified} name={ekyc.panName} holderType={ekyc.panHolderType} fallbackName={session?.name ?? ""} />
      <div className="grid gap-5 md:grid-cols-2">
        <AadhaarCard verified={ekyc.aadhaarVerified} last4={ekyc.aadhaarLast4} />
        <MobileCard verified={ekyc.mobileVerified} mobile={ekyc.mobile} />
      </div>
    </div>
  );
}

function PanCard({
  pan,
  verified,
  name,
  holderType,
  fallbackName,
}: {
  pan: string;
  verified: boolean;
  name: string;
  holderType: string;
  fallbackName: string;
}) {
  const [busy, setBusy] = useState(false);
  const valid = PAN_RE.test(pan);

  async function verify() {
    setBusy(true);
    try {
      const r = await verifyPanNsdl(pan, fallbackName);
      patchEkyc({ panVerified: true, panName: r.name, panHolderType: r.holderType });
      toast.success("PAN verified with NSDL");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel kicker="NSDL · simulated" title="PAN card" done={verified}>
      <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-end">
        <Field
          label="Permanent Account Number"
          htmlFor="pan"
          hint="Format: ABCDE1234F — five letters, four digits, one letter"
          error={pan.length === 10 && !valid ? "That doesn't look like a valid PAN" : null}
        >
          <Input
            id="pan"
            value={pan}
            disabled={verified}
            onChange={(e) => patchEkyc({ pan: maskPan(e.target.value), panVerified: false })}
            placeholder="ABCDE1234F"
            className="h-12 bg-background font-mono text-lg tracking-[0.3em] uppercase"
          />
        </Field>
        {!verified && (
          <Button variant="ledger" size="lg" disabled={!valid || busy} onClick={verify}>
            {busy && <Loader2 className="animate-spin" />} Verify with NSDL
          </Button>
        )}
      </div>
      {verified && (
        <div className="mt-4 rounded-xl bg-secondary/60 px-4 py-1">
          <KeyValue k="Name on record" v={name} />
          <KeyValue k="Holder type" v={holderType} />
          <KeyValue k="Status" v="Existing & valid" />
        </div>
      )}
    </Panel>
  );
}

function OtpFlow({
  label,
  canSend,
  onVerified,
  disabled,
}: {
  label: string;
  canSend: boolean;
  onVerified: () => void;
  disabled?: boolean;
}) {
  const [sent, setSent] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    const code = await sendOtp();
    setBusy(false);
    setSent(code);
    setOtp("");
    toast.message(`Demo OTP · ${label}`, { description: code, duration: 15000 });
  }

  if (disabled) return null;
  if (!sent)
    return (
      <Button variant="outline" disabled={!canSend || busy} onClick={send} className="w-full">
        {busy && <Loader2 className="animate-spin" />} Send OTP
      </Button>
    );

  return (
    <div className="space-y-3">
      <OtpField value={otp} onChange={setOtp} />
      <div className="flex gap-2">
        <Button
          variant="ledger"
          disabled={otp.length !== 6}
          onClick={() => {
            if (otp === sent) onVerified();
            else toast.error("Incorrect code — check the demo OTP notification");
          }}
        >
          Verify code
        </Button>
        <Button variant="ghost" onClick={send}>
          Resend
        </Button>
      </div>
    </div>
  );
}

function AadhaarCard({ verified, last4 }: { verified: boolean; last4: string }) {
  const [num, setNum] = useState("");
  const valid = AADHAAR_RE.test(num);
  const pretty = num.replace(/(\d{4})(?=\d)/g, "$1 ");
  return (
    <Panel kicker="UIDAI · simulated" title="Aadhaar" done={verified}>
      {verified ? (
        <p className="font-mono text-lg tracking-[0.2em]">XXXX XXXX {last4}</p>
      ) : (
        <div className="space-y-4">
          <Field
            label="12-digit Aadhaar number"
            htmlFor="aadhaar"
            error={num.length === 12 && !valid ? "Aadhaar numbers don't start with 0 or 1" : null}
            hint="Only the last 4 digits are stored"
          >
            <Input
              id="aadhaar"
              inputMode="numeric"
              value={pretty}
              onChange={(e) => setNum(e.target.value.replace(/\D/g, "").slice(0, 12))}
              placeholder="2345 6789 0123"
              className="h-11 bg-background font-mono tracking-widest"
            />
          </Field>
          <OtpFlow
            label="Aadhaar-linked mobile"
            canSend={valid}
            onVerified={() => {
              patchEkyc({ aadhaarVerified: true, aadhaarLast4: num.slice(-4) });
              toast.success("Aadhaar verified");
            }}
          />
        </div>
      )}
    </Panel>
  );
}

function MobileCard({ verified, mobile }: { verified: boolean; mobile: string }) {
  const valid = MOBILE_RE.test(mobile);
  return (
    <Panel kicker="Telecom OTP · simulated" title="Mobile number" done={verified}>
      {verified ? (
        <p className="font-mono text-lg tracking-widest">+91 {mobile}</p>
      ) : (
        <div className="space-y-4">
          <Field label="Mobile number" htmlFor="kmobile" hint="Used for repayment reminders">
            <div className="flex">
              <span className="grid place-items-center rounded-l-md border border-r-0 bg-secondary px-3 font-mono text-sm">+91</span>
              <Input
                id="kmobile"
                inputMode="numeric"
                value={mobile}
                onChange={(e) => patchEkyc({ mobile: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                placeholder="98765 43210"
                className="h-11 rounded-l-none bg-background font-mono"
              />
            </div>
          </Field>
          <OtpFlow
            label={`+91 ${mobile}`}
            canSend={valid}
            onVerified={() => {
              patchEkyc({ mobileVerified: true });
              toast.success("Mobile verified");
            }}
          />
        </div>
      )}
    </Panel>
  );
}
