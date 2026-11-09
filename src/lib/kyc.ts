// Simulated e-KYC providers (NSDL PAN, UIDAI Aadhaar OTP, telecom OTP, penny drop).

export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const AADHAAR_RE = /^[2-9][0-9]{11}$/;
export const MOBILE_RE = /^[6-9][0-9]{9}$/;
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const ACCOUNT_RE = /^[0-9]{9,18}$/;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Mask free text into PAN shape: 5 letters, 4 digits, 1 letter. */
export function maskPan(raw: string) {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  let out = "";
  for (const ch of s) {
    const i = out.length;
    if (i >= 10) break;
    if ((i < 5 || i === 9) && /[A-Z]/.test(ch)) out += ch;
    else if (i >= 5 && i < 9 && /[0-9]/.test(ch)) out += ch;
  }
  return out;
}

const PAN_HOLDER_TYPES: Record<string, string> = {
  P: "Individual",
  F: "Firm / LLP",
  C: "Company",
  H: "HUF",
  A: "Association of Persons",
  T: "Trust",
};

export async function verifyPanNsdl(pan: string, fallbackName: string) {
  await wait(900);
  if (!PAN_RE.test(pan)) throw new Error("PAN format is invalid");
  const name = (fallbackName || "Merchant").toUpperCase();
  return {
    name,
    holderType: PAN_HOLDER_TYPES[pan.charAt(3)] ?? "Individual",
    status: "VALID — E (Existing and Valid)",
  };
}

export function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function sendOtp() {
  await wait(700);
  return generateOtp();
}

const BANKS: Record<string, string> = {
  HDFC: "HDFC Bank",
  ICIC: "ICICI Bank",
  SBIN: "State Bank of India",
  UTIB: "Axis Bank",
  KKBK: "Kotak Mahindra Bank",
  PUNB: "Punjab National Bank",
  BARB: "Bank of Baroda",
  YESB: "Yes Bank",
  IDFB: "IDFC First Bank",
  INDB: "IndusInd Bank",
};

export async function pennyDrop(account: string, ifsc: string, holder: string) {
  await wait(1200);
  if (!ACCOUNT_RE.test(account)) throw new Error("Account number must be 9–18 digits");
  if (!IFSC_RE.test(ifsc)) throw new Error("IFSC format is invalid");
  return {
    bank: BANKS[ifsc.slice(0, 4)] ?? "Partner bank",
    branch: `Branch ${ifsc.slice(5)}`,
    holder: holder || "MERCHANT",
    utr: `UTR${Date.now().toString().slice(-10)}`,
    creditedInr: 1,
  };
}

/** Deterministic simulated bureau pull, seeded by PAN. */
export async function fetchCibil(pan: string) {
  await wait(1000);
  let h = 0;
  for (const c of pan) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return 600 + (h % 221); // 600–820
}
