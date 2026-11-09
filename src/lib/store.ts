// Demo-mode application state, persisted to localStorage.
import { useSyncExternalStore } from "react";
import type { Decision, NegotiationState, RuleCheck } from "./bre";

export interface Session {
  name: string;
  email: string;
  mobile?: string;
  method: "email" | "otp";
}

export interface EKyc {
  pan: string;
  panName: string;
  panHolderType: string;
  panVerified: boolean;
  aadhaarLast4: string;
  aadhaarVerified: boolean;
  mobile: string;
  mobileVerified: boolean;
}

export interface VKyc {
  verified: boolean;
  completedAt: string | null;
  mode: "camera" | "simulated" | null;
  snapshot: string | null;
}

export interface Financials {
  accountNumber: string;
  ifsc: string;
  bankVerified: boolean;
  bankName: string;
  pennyDropUtr: string;
  cibil: number;
  vintageMonths: number;
  salesGrowthPct: number;
  monthlyTurnoverInr: number;
  requestedAmountInr: number;
  payoutEmail: string;
}

export interface ChatMessage {
  id: string;
  from: "bot" | "merchant" | "system";
  text: string;
  at: string;
}

export interface PayoutInfo {
  senderBatchId: string;
  payoutBatchId: string;
  batchStatus: string;
  amountInr: number;
  receiver: string;
  fees: string | null;
  transactionId: string | null;
  transactionStatus: string | null;
  timeCompleted: string | null;
  error: string | null;
}

export interface AuditEvent {
  at: string;
  label: string;
  tone?: "ok" | "warn" | "bad" | "info" | undefined;
}

export interface Loan {
  id: string;
  decision: Decision;
  reasons: string[];
  checks: RuleCheck[];
  apr: number | null;
  status: "REJECTED" | "NEGOTIATING" | "APPROVED" | "DISBURSING" | "DISBURSED" | "FAILED";
  negotiation: NegotiationState | null;
  chat: ChatMessage[];
  payout: PayoutInfo | null;
  events: AuditEvent[];
  createdAt: string;
}

export interface AppState {
  session: Session | null;
  ekyc: EKyc;
  vkyc: VKyc;
  financials: Financials;
  loan: Loan | null;
}

const KEY = "munim-capital:v1";

export const initialState: AppState = {
  session: null,
  ekyc: {
    pan: "",
    panName: "",
    panHolderType: "",
    panVerified: false,
    aadhaarLast4: "",
    aadhaarVerified: false,
    mobile: "",
    mobileVerified: false,
  },
  vkyc: { verified: false, completedAt: null, mode: null, snapshot: null },
  financials: {
    accountNumber: "",
    ifsc: "",
    bankVerified: false,
    bankName: "",
    pennyDropUtr: "",
    cibil: 0,
    vintageMonths: 0,
    salesGrowthPct: 0,
    monthlyTurnoverInr: 0,
    requestedAmountInr: 0,
    payoutEmail: "",
  },
  loan: null,
};

let state: AppState = initialState;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) state = { ...initialState, ...JSON.parse(raw) };
  } catch {
    state = initialState;
  }
}

function persist() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage full or disabled; keep in memory
  }
}

export function getState() {
  load();
  return state;
}

export function setState(updater: (s: AppState) => AppState) {
  load();
  state = updater(state);
  persist();
  listeners.forEach((l) => l());
}

export function resetApplication(keepSession = true) {
  setState((s) => ({ ...initialState, session: keepSession ? s.session : null }));
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useAppState() {
  return useSyncExternalStore(subscribe, getState, () => initialState);
}

export function updateLoan(fn: (l: Loan) => Loan) {
  setState((s) => (s.loan ? { ...s, loan: fn(s.loan) } : s));
}

export function logEvent(label: string, tone: AuditEvent["tone"] = "info") {
  updateLoan((l) => ({ ...l, events: [...l.events, { at: new Date().toISOString(), label, tone }] }));
}

export const uid = (p = "") =>
  p + Math.random().toString(36).slice(2, 8).toUpperCase() + Date.now().toString(36).slice(-4).toUpperCase();
