// Business Rule Engine: underwriting decision matrix + negotiation evaluator.
// Pure functions, shared by the browser and the payout server function.

export const POLICY = {
  maxAmountUsd: 12_000,
  autoApproveCibil: 680,
  negotiationCibilMin: 620,
  autoApproveVintageMonths: 12,
  minVintageMonths: 6,
  autoApproveGrowthPct: 5,
  defaultApr: 14,
  baselineApr: 18,
  floorApr: 16,
  currency: "USD",
  tenureMonths: 12,
} as const;

/** How hard the Risk Officer bargains. */
export const NEGOTIATION = {
  /** Most the bot will drop its offer in one round. */
  maxConcession: 0.5,
  /** Least the bot drops when it does concede. */
  minConcession: 0.25,
  /** Bot counters at least this far above the merchant's ask. */
  marginAboveAsk: 0.5,
  /** Ask within this gap of the current offer gets accepted. */
  closeEnough: 0.25,
} as const;

export type Decision = "AUTO_APPROVED" | "NEGOTIATION_REQUIRED" | "REJECTED";

export interface FinancialProfile {
  cibil: number;
  vintageMonths: number;
  salesGrowthPct: number;
  monthlyTurnoverUsd: number;
  requestedAmountUsd: number;
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
      passed: p.requestedAmountUsd > 0 && p.requestedAmountUsd <= POLICY.maxAmountUsd,
      detail: `$${p.requestedAmountUsd.toLocaleString("en-US")} (cap $${POLICY.maxAmountUsd.toLocaleString("en-US")})`,
    },
  ];

  const reasons: string[] = [];
  if (p.cibil < POLICY.negotiationCibilMin)
    reasons.push(`CIBIL score ${p.cibil} is below the policy minimum of ${POLICY.negotiationCibilMin}.`);
  if (p.vintageMonths < POLICY.minVintageMonths)
    reasons.push(
      `Shop vintage of ${p.vintageMonths} months is below the ${POLICY.minVintageMonths}-month minimum.`,
    );
  if (p.requestedAmountUsd > POLICY.maxAmountUsd)
    reasons.push(`Requested amount exceeds the $${POLICY.maxAmountUsd.toLocaleString("en-US")} cap.`);
  if (p.requestedAmountUsd <= 0) reasons.push(`Requested amount must be greater than zero.`);

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
      reply: `My offer stands at ${state.currentOffer}% APR. If you want a lower rate, name it, e.g. "Can you offer 16.5%?"`,
      state,
    };
  }

  const r = round2(rate);
  const next = { ...state, rounds: state.rounds + 1 };
  const offer = state.currentOffer;

  // Asking for the current offer or more: lock in the current offer.
  if (r >= offer) {
    return {
      reply: r > offer ? `No need to pay more — offer accepted at ${offer}% APR!` : `Offer accepted at ${offer}% APR!`,
      state: { ...next, agreedApr: offer },
    };
  }

  // The merchant has bargained to within a hair of the offer: meet them there.
  if (r >= POLICY.floorApr && offer - r <= NEGOTIATION.closeEnough) {
    return { reply: `Offer accepted at ${r}% APR!`, state: { ...next, agreedApr: r } };
  }

  // Already at the floor: hold firm.
  if (offer <= POLICY.floorApr) {
    return {
      reply: `I can't go below ${POLICY.floorApr}% APR for your risk band. That's my final offer — say "accept" to lock it in.`,
      state: next,
    };
  }

  // Counter slightly above the ask, conceding only a little each round.
  let counter = ceilQuarter(
    Math.max(r + NEGOTIATION.marginAboveAsk, offer - NEGOTIATION.maxConcession, POLICY.floorApr),
  );
  counter = Math.max(POLICY.floorApr, Math.min(counter, round2(offer - NEGOTIATION.minConcession)));

  let reply: string;
  if (counter === POLICY.floorApr) {
    reply = `You drive a hard bargain. ${counter}% APR is the lowest our policy allows — that's my final offer.`;
  } else if (r < POLICY.floorApr) {
    reply = `${r}% is below what our policy allows for your risk band. The best I can do right now is ${counter}% APR.`;
  } else {
    const lines = [
      `${r}% is too low for a file with borderline signals. I can move to ${counter}% APR.`,
      `I hear you, but ${r}% doesn't work for us. Let's meet at ${counter}% APR.`,
      `I'm stretching here. ${counter}% APR, and that's with your sales history in mind.`,
      `I'm close to my limit. ${counter}% APR is the best I can do on this round.`,
    ];
    reply = lines[Math.min(state.rounds, lines.length - 1)] ?? `I can move to ${counter}% APR.`;
  }
  return { reply, state: { ...next, currentOffer: counter } };
}

/** Round up to the next 0.25 — the bank rounds in its own favour. */
function ceilQuarter(n: number) {
  return Math.ceil(n * 4 - 1e-9) / 4;
}

// ---------- Money helpers ----------

export function emi(principal: number, apr: number, months: number = POLICY.tenureMonths) {
  const r = apr / 12 / 100;
  if (r === 0) return principal / months;
  return (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
}

export const formatUsd = (n: number) =>
  `$${Math.round(n).toLocaleString("en-US")}`;
