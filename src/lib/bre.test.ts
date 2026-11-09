import { describe, expect, it } from "vitest";
import { initialNegotiation, negotiate, underwrite, inrToUsd } from "./bre";

const base = {
  cibil: 720,
  vintageMonths: 24,
  salesGrowthPct: 12,
  monthlyTurnoverInr: 400000,
  requestedAmountInr: 500000,
};

describe("underwriting", () => {
  it("auto-approves CIBIL 680, 12 months vintage, growth above 5%, amount up to ₹10L", () => {
    const r = underwrite({ ...base, cibil: 680, vintageMonths: 12, salesGrowthPct: 5.1, requestedAmountInr: 1_000_000 });
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

  it("rejects amounts above ₹10 lakh", () => {
    expect(underwrite({ ...base, requestedAmountInr: 1_000_001 }).decision).toBe("REJECTED");
  });
});

describe("negotiation", () => {
  it("accepts a counter-offer of 16%", () => {
    const r = negotiate(initialNegotiation(), "Can you offer 16%?");
    expect(r.state.agreedApr).toBe(16);
    expect(r.reply).toBe("Offer accepted at 16% APR!");
  });

  it("accepts a counter-offer of 17.5%", () => {
    expect(negotiate(initialNegotiation(), "17.5").state.agreedApr).toBe(17.5);
  });

  it("declines 15% and counter-proposes without going below 16%", () => {
    let s = initialNegotiation();
    for (let i = 0; i < 5; i++) {
      const r = negotiate(s, "15%");
      expect(r.state.agreedApr).toBeNull();
      expect(r.state.currentOffer).toBeGreaterThanOrEqual(16);
      s = r.state;
    }
    expect(s.currentOffer).toBe(16);
  });

  it("converts ₹10 lakh to about $12,000", () => {
    expect(inrToUsd(1_000_000)).toBeCloseTo(12000.48, 1);
  });
});
