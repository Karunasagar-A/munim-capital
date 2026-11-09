// Business Rule Engine: underwriting decision matrix + negotiation evaluator.
// Pure functions, shared by the browser and the payout server function.

export const POLICY = {
  maxAmountInr: 1_000_000,
  autoApproveCibil: 680,
  negotiationCibilMin: 620,
  autoApproveVintageMonths: 12,
  minVintageMonths: 6,
  autoApproveGrowthPct: 5,
  defaultApr: 14,
  baselineApr: 18,
  floorApr: 16,
  inrPerUsd: 83.33,
  tenureMonths: 12,
} as const;

export type Decision = "AUTO_APPROVED" | "NEGOTIATION_REQUIRED" | "REJECTED";

export interface FinancialProfile {
  cibil: number;
  vintageMonths: number;
  salesGrowthPct: number;
  monthlyTurnoverInr: number;
  requestedAmountInr: number;
}

export interface RuleCheck {
  rule: string;
  passed: boolean;
  detail: string;
}

export interface UnderwritingResult {
  decision: Decision;
  apr: number | null;
  reasons: string[];
  checks: RuleCheck[];
}

export function underwrite(p: FinancialProfile): UnderwritingResult {
  const checks: RuleCheck[] = [
    {
      rule: "Bureau score",
      passed: p.cibil >= POLICY.autoApproveCibil,
      detail: `CIBIL ${p.cibil} (auto ≥ ${POLICY.autoApproveCibil}, floor ${POLICY.negotiationCibilMin})`,
    },
    {
      rule: "Shop vintage",
      passed: p.vintageMonths >= POLICY.autoApproveVintageMonths,
      detail: `${p.vintageMonths} months (auto ≥ ${POLICY.autoApproveVintageMonths}, floor ${POLICY.minVintageMonths})`,
    },
    {
      rule: "Sales growth",
      passed: p.salesGrowthPct > POLICY.autoApproveGrowthPct,
      detail: `${p.salesGrowthPct}% YoY (auto > ${POLICY.autoApproveGrowthPct}%)`,
    },
    {
      rule: "Ticket size",
      passed: p.requestedAmountInr > 0 && p.requestedAmountInr <= POLICY.maxAmountInr,
      detail: `₹${p.requestedAmountInr.toLocaleString("en-IN")} (cap ₹${POLICY.maxAmountInr.toLocaleString("en-IN")})`,
    },
  ];

  const reasons: string[] = [];
  if (p.cibil < POLICY.negotiationCibilMin)
    reasons.push(`CIBIL score ${p.cibil} is below the policy minimum of ${POLICY.negotiationCibilMin}.`);
  if (p.vintageMonths < POLICY.minVintageMonths)
    reasons.push(
      `Shop vintage of ${p.vintageMonths} months is below the ${POLICY.minVintageMonths}-month minimum.`,
    );
  if (p.requestedAmountInr > POLICY.maxAmountInr)
    reasons.push(`Requested amount exceeds the ₹10 lakh cap.`);
  if (p.requestedAmountInr <= 0) reasons.push(`Requested amount must be greater than zero.`);

  if (reasons.length > 0) return { decision: "REJECTED", apr: null, reasons, checks };

  if (checks.every((c) => c.passed)) {
    return {
      decision: "AUTO_APPROVED",
      apr: POLICY.defaultApr,
      reasons: ["All auto-approval rules passed."],
      checks,
    };
  }

  return {
    decision: "NEGOTIATION_REQUIRED",
    apr: POLICY.baselineApr,
    reasons: checks.filter((c) => !c.passed).map((c) => `${c.rule} is borderline: ${c.detail}.`),
    checks,
  };
}

// ---------- Negotiation ----------

export interface NegotiationState {
  currentOffer: number;
  rounds: number;
  agreedApr: number | null;
}

export const initialNegotiation = (): NegotiationState => ({
  currentOffer: POLICY.baselineApr,
  rounds: 0,
  agreedApr: null,
});

export const BOT_INTRO = `Based on your risk profile, we can approve your funding at ${POLICY.baselineApr}% APR.`;

/** Pull a rate like "16", "16.5%", "16 percent" out of free text. */
export function parseRate(text: string): number | null {
  const m = text.match(/(\d{1,2}(?:\.\d{1,2})?)\s*(%|percent|apr)?/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0 || n > 60) return null;
  return n;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface BotReply {
  reply: string;
  state: NegotiationState;
}

export function negotiate(state: NegotiationState, message: string): BotReply {
  if (state.agreedApr !== null) {
    return { reply: `We're locked in at ${state.agreedApr}% APR. Review the contract to disburse.`, state };
  }

  const wantsAccept = /\b(accept|deal|agree|ok(ay)?|yes|done)\b/i.test(message);
  const rate = parseRate(message);

  if (rate === null) {
    if (wantsAccept) {
      return {
        reply: `Offer accepted at ${state.currentOffer}% APR!`,
        state: { ...state, agreedApr: state.currentOffer },
      };
    }
    return {
      reply: `My current offer is ${state.currentOffer}% APR. Tell me the rate you have in mind, e.g. "Can you offer 16.5%?"`,
      state,
    };
  }

  const r = round2(rate);
  const next = { ...state, rounds: state.rounds + 1 };

  if (r >= POLICY.floorApr && r <= POLICY.baselineApr) {
    // Never agree above what the bot has already offered.
    const agreed = Math.min(r, state.currentOffer);
    return { reply: `Offer accepted at ${agreed}% APR!`, state: { ...next, agreedApr: agreed } };
  }

  if (r > POLICY.baselineApr) {
    return {
      reply: `No need to pay more — offer accepted at ${state.currentOffer}% APR!`,
      state: { ...next, agreedApr: state.currentOffer },
    };
  }

  // Below the floor: decline and step the counter-proposal down toward the floor.
  const counter = Math.max(POLICY.floorApr, round2(state.currentOffer - 1));
  const atFloor = counter === POLICY.floorApr;
  return {
    reply: atFloor
      ? `I can't go below ${POLICY.floorApr}% APR for your risk band — that's my final offer at ${counter}% APR.`
      : `${r}% is below what policy allows. I can come down to ${counter}% APR.`,
    state: { ...next, currentOffer: counter },
  };
}

// ---------- Money helpers ----------

export const inrToUsd = (inr: number) => round2(inr / POLICY.inrPerUsd);

export function emi(principal: number, apr: number, months: number = POLICY.tenureMonths) {
  const r = apr / 12 / 100;
  if (r === 0) return principal / months;
  return (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
}

export const formatInr = (n: number) =>
  `₹${Math.round(n).toLocaleString("en-IN")}`;
