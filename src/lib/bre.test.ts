import { describe, expect, it } from "vitest";
import { POLICY, initialNegotiation, negotiate, underwrite, type NegotiationState } from "./bre";

const base = {
  cibil: 720,
  vintageMonths: 24,
  salesGrowthPct: 12,
  monthlyTurnoverUsd: 4800,
  requestedAmountUsd: 6000,
};

describe("underwriting", () => {
  it("auto-approves CIBIL 680, 12 months vintage, growth above 5%, amount up to $12,000", () => {
    const r = underwrite({ ...base, cibil: 680, vintageMonths: 12, salesGrowthPct: 5.1, requestedAmountUsd: 12_000 });
    expect(r.decision).toBe("AUTO_APPROVED");
    expect(r.apr).toBe(14);
  });

  it("sends CIBIL 620–679 to negotiation at 18% APR", () => {
    expect(underwrite({ ...base, cibil: 620 }).decision).toBe("NEGOTIATION_REQUIRED");
    const r = underwrite({ ...base, cibil: 679 });
    expect(r.decision).toBe("NEGOTIATION_REQUIRED");
    expect(r.apr).toBe(18);
  });

  it("sends growth of exactly 5% (marginal) to negotiation", () => {
    expect(underwrite({ ...base, salesGrowthPct: 5 }).decision).toBe("NEGOTIATION_REQUIRED");
  });

  it("rejects CIBIL below 620", () => {
    expect(underwrite({ ...base, cibil: 619 }).decision).toBe("REJECTED");
  });

  it("rejects vintage below 6 months", () => {
    expect(underwrite({ ...base, vintageMonths: 5 }).decision).toBe("REJECTED");
  });

  it("rejects amounts above $12,000", () => {
    expect(underwrite({ ...base, requestedAmountUsd: 12_001 }).decision).toBe("REJECTED");
  });
});

describe("currency", () => {
  it("pays out in USD only", () => {
    expect(POLICY.currency).toBe("USD");
  });
});

describe("negotiation", () => {
  it("does not accept a first ask of 16%; counters slightly above it and below 18%", () => {
    const r = negotiate(initialNegotiation(), "Can you offer 16%?");
    expect(r.state.agreedApr).toBeNull();
    expect(r.state.currentOffer).toBeGreaterThan(16);
    expect(r.state.currentOffer).toBeLessThan(18);
  });

  it("concedes at most 0.5% per round", () => {
    let s: NegotiationState = initialNegotiation();
    for (let i = 0; i < 4; i++) {
      const before = s.currentOffer;
      s = negotiate(s, "16%").state;
      if (s.agreedApr !== null) break;
      expect(before - s.currentOffer).toBeLessThanOrEqual(0.5);
      expect(before - s.currentOffer).toBeGreaterThan(0);
    }
  });

  it("reaches 16% only after the merchant keeps bargaining (several rounds)", () => {
    let s: NegotiationState = initialNegotiation();
    let rounds = 0;
    while (s.agreedApr === null && rounds < 10) {
      s = negotiate(s, "16%").state;
      rounds++;
    }
    expect(s.agreedApr).toBe(16);
    expect(rounds).toBeGreaterThanOrEqual(4);
  });

  it("counters just above a near ask instead of accepting it (18% offer, 17.5% ask → 17.75%)", () => {
    const r = negotiate(initialNegotiation(), "17.5%");
    expect(r.state.agreedApr).toBeNull();
    expect(r.state.currentOffer).toBe(17.75);
  });

  it("accepts an ask within 0.25% of the current offer", () => {
    expect(negotiate(initialNegotiation(), "17.75").state.agreedApr).toBe(17.75);
  });

  it("never goes below the 16% floor when asked for 15% repeatedly", () => {
    let s: NegotiationState = initialNegotiation();
    for (let i = 0; i < 8; i++) {
      const r = negotiate(s, "15%");
      expect(r.state.agreedApr).toBeNull();
      expect(r.state.currentOffer).toBeGreaterThanOrEqual(16);
      s = r.state;
    }
    expect(s.currentOffer).toBe(16);
  });

  it("'accept' locks in the current offer", () => {
    const countered = negotiate(initialNegotiation(), "16%").state;
    const r = negotiate(countered, "ok, accept");
    expect(r.state.agreedApr).toBe(countered.currentOffer);
  });
});
