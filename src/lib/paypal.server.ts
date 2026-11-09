// PayPal REST calls via the Lovable connector gateway (sandbox connection).
// The gateway handles the OAuth 2.0 client-credentials token exchange.
const GATEWAY_URL = "https://connector-gateway.lovable.dev/paypal";

export async function paypal<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const paypalKey = process.env["PAYPAL_API_KEY"];
  if (!lovableKey || !paypalKey) throw new Error("PayPal is not connected (missing credentials).");

  const res = await fetch(`${GATEWAY_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": paypalKey,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`PayPal ${path} failed [${res.status}]: ${text}`);
    let message = text;
    try {
      const j = JSON.parse(text);
      message = [j.name, j.message, j.details?.[0]?.issue].filter(Boolean).join(" — ");
    } catch {
      // keep raw text
    }
    throw new Error(`PayPal ${res.status}: ${message}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}
