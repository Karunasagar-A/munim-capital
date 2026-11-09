import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { POLICY, needsOfficerSettlement, underwrite } from "./bre";
import { paypal } from "./paypal.server";

const disburseInput = z.object({
  loanId: z.string().regex(/^[A-Z0-9-]{6,40}$/),
  apr: z.number(),
  recipientEmail: z.string().email().max(254),
  merchantName: z.string().max(120),
  profile: z.object({
    cibil: z.number().int().min(300).max(900),
    vintageMonths: z.number().min(0).max(1200),
    salesGrowthPct: z.number().min(-100).max(1000),
    monthlyTurnoverUsd: z.number().min(0),
    requestedAmountUsd: z.number().positive().max(POLICY.maxAmountUsd),
  }),
});

type DisburseResult =
  | {
      ok: true;
      senderBatchId: string;
      payoutBatchId: string;
      batchStatus: string;
      amountUsd: number;
    }
  | { ok: false; error: string };

interface PayoutBatchResponse {
  batch_header: {
    payout_batch_id: string;
    batch_status: string;
    sender_batch_header?: { sender_batch_id: string };
    time_completed?: string;
    fees?: { currency: string; value: string };
  };
  items?: Array<{
    payout_item_id: string;
    transaction_id?: string;
    transaction_status?: string;
    payout_item_fee?: { currency: string; value: string };
    errors?: { name?: string; message?: string };
  }>;
}

export const disburseLoan = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => disburseInput.parse(d))
  .handler(async ({ data }): Promise<DisburseResult> => {
    // Re-run the rule engine server-side: the browser can't push an ineligible payout.
    const uw = underwrite(data.profile);
    if (uw.decision === "REJECTED") return { ok: false, error: "Application does not meet credit policy." };
    if (needsOfficerSettlement(uw.decision, data.profile.requestedAmountUsd))
      return {
        ok: false,
        error: `Amounts above $${POLICY.disbursementCapUsd.toLocaleString("en-US")} are settled by our officials, not paid out online.`,
      };
    if (uw.decision === "AUTO_APPROVED" && data.apr !== POLICY.defaultApr)
      return { ok: false, error: "APR does not match the approved rate." };
    if (
      uw.decision === "NEGOTIATION_REQUIRED" &&
      (data.apr < POLICY.floorApr || data.apr > POLICY.baselineApr)
    )
      return { ok: false, error: `Negotiated APR must be between ${POLICY.floorApr}% and ${POLICY.baselineApr}%.` };

    const amountUsd = data.profile.requestedAmountUsd;
    const senderBatchId = `LOAN-${data.loanId}`;
    try {
      const res = await paypal<PayoutBatchResponse>("/v1/payments/payouts", {
        method: "POST",
        headers: { "PayPal-Request-Id": senderBatchId },
        body: JSON.stringify({
          sender_batch_header: {
            sender_batch_id: senderBatchId,
            email_subject: "Your Minimum Capital working capital is here",
            email_message: `Loan ${data.loanId} disbursed at ${data.apr}% APR.`,
          },
          items: [
            {
              recipient_type: "EMAIL",
              amount: { value: amountUsd.toFixed(2), currency: POLICY.currency },
              receiver: data.recipientEmail,
              note: `Working capital loan ${data.loanId} for ${data.merchantName} at ${data.apr}% APR`,
              sender_item_id: `${data.loanId}-1`,
            },
          ],
        }),
      });
      return {
        ok: true,
        senderBatchId,
        payoutBatchId: res.batch_header.payout_batch_id,
        batchStatus: res.batch_header.batch_status,
        amountUsd,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "PayPal payout failed" };
    }
  });

type StatusResult =
  | {
      ok: true;
      batchStatus: string;
      fees: string | null;
      transactionId: string | null;
      transactionStatus: string | null;
      timeCompleted: string | null;
      itemError: string | null;
    }
  | { ok: false; error: string };

export const getPayoutStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ payoutBatchId: z.string().regex(/^[A-Z0-9]{6,40}$/) }).parse(d))
  .handler(async ({ data }): Promise<StatusResult> => {
    try {
      const res = await paypal<PayoutBatchResponse>(`/v1/payments/payouts/${data.payoutBatchId}`, {
        method: "GET",
      });
      const item = res.items?.[0];
      return {
        ok: true,
        batchStatus: res.batch_header.batch_status,
        fees: res.batch_header.fees?.value ?? item?.payout_item_fee?.value ?? null,
        transactionId: item?.transaction_id ?? null,
        transactionStatus: item?.transaction_status ?? null,
        timeCompleted: res.batch_header.time_completed ?? null,
        itemError: item?.errors?.message ?? null,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Status lookup failed" };
    }
  });
