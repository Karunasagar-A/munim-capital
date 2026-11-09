<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules

- Credit policy lives only in `src/lib/bre.ts` (pure functions); the payout server function re-runs `underwrite()` so the browser can't push an ineligible payout. Keep `src/lib/bre.test.ts` in sync with policy changes.
- Demo-mode app state (session, KYC, loan, chat, audit log) lives in `src/lib/store.ts` (localStorage via useSyncExternalStore); there is no database — add Lovable Cloud before introducing real accounts.
- PayPal calls go only through `src/lib/paypal.server.ts` (connector gateway, server-side); never call api-m.paypal.com or embed PayPal credentials.
- e-KYC providers (NSDL, UIDAI, telecom OTP, penny drop, bureau) are simulated in `src/lib/kyc.ts`; swap implementations there when real providers are added.
