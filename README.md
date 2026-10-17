# ✦ Wishes

Self-hosted family wishlists for kids and grown-ups. Raccoons and geese welcome.

**Stack:** Next.js 16 (App Router, server actions) + SQLite via Node's built-in `node:sqlite`. No native modules, one data folder, one container.

## What's in it

- **Accounts** with email + password, **2FA** (authenticator app / TOTP), **OIDC single sign-on** (Tinyauth, Authelia, Authentik, Pocket ID, Keycloak, Google…), and optional **forward-auth header** sign-in. The first account becomes admin.
- **Profiles**: manage lists for kids (or pets) who don't need a login. Parents see claims on kids' lists to coordinate; your own lists keep the surprise.
- **Families** with invite codes, admins, and **connected families** (e.g. the grandparents' house).
- **Lists** per profile with occasion, date countdown, emoji, and visibility: *my families*, *only chosen families* (including connected ones), or *hidden*. **Hide from specific people** even inside a shared family.
- **Guests by email**: a private link per email lets someone view or edit a list without an account (they never see claims).
- **Claiming & purchases**: "I'll get it", then "I bought this" with price paid, store and quantity. Every list has a purchase history showing who bought what. Optionally, purchases by people who don't manage the list wait for a manager to confirm them. The person a list is for never sees claims or purchases; parents of kid profiles and co-owners do.
- **Co-owners**: add family members as co-owners of a list (two parents running a kid's list).
- **Categories, filters and sorting**: Electronics, Clothes, Toys, Perfume & Cologne, Beauty and more (guessed automatically from the name). Filter by category, status, price or search; sort by most wanted, price, newest, name or category. Each wish also has type/style, color and size fields.
- **Link autofill**: paste a link and Wishes fills name, price, image and store. Generic JSON-LD/OpenGraph parsing works on most shops (Shopify, LEGO, Etsy…), with extra adapters for **Amazon, Walmart, Target, Kohl's**. Stores that block bots (Kohl's and Best Buy often do) fall back gracefully so you fill in details by hand.
- **Price tracking & deal alerts**: linked items are re-checked every `PRICE_CHECK_HOURS`; a 5%+ drop sends an alert to whoever claimed it (or the owner). Cross-store checking has a plug-in point: `priceSources` in `src/lib/scrape/index.ts`.
- **AI gift ideas (optional)**: Claude, OpenAI, Gemini, Meta Llama API, or a local LLM (Ollama / LM Studio / any OpenAI-compatible endpoint). Ideas land in a **review list** with a store, category and a store search link; nothing is added without a yes. Configure in **Settings → Server**.
- **Avatars**: raccoons, geese and friends, plus "Roll a random critter" with Common, Rare and Epic accessories. **Space Goose** is the Legendary roll. Rolls build a collection.
- **Themes**: Auto (follows OS dark mode), Sunny, Night, Candy, Forest, Ocean, Arcade. Mobile-first layout with a bottom tab bar, installable as a home-screen app.

## Run it on Unraid

1. Build the image on the server (or push it to your registry):
   ```bash
   docker build -t wishes:latest .
   ```
2. Copy `unraid/wishes.xml` to `/boot/config/plugins/dockerMan/templates-user/` and add the container from **Docker → Add Container → Template: wishes**. Appdata defaults to `/mnt/user/appdata/wishes`.
3. Open `http://[server]:3000` and create the first (admin) account.

Or with compose: `docker compose up -d --build`.

The container runs as `99:100` (nobody:users) by default; change `PUID`/`PGID` if needed. Back up by copying `/data/wishes.db`.

## Configuration

All settings are environment variables; see [.env.example](.env.example).

| Variable | Purpose |
| --- | --- |
| `APP_URL` | Public URL. Needed for OIDC redirects behind a proxy. |
| `ALLOW_SIGNUP` | `false` closes sign-ups after the first account. |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_NAME` | Single sign-on. Redirect URI: `${APP_URL}/auth/oidc/callback`. |
| `OIDC_AUTO_CREATE`, `OIDC_SKIP_2FA` | Create accounts on first SSO login (default on); skip local 2FA for SSO users. |
| `TRUSTED_EMAIL_HEADER` | Forward-auth header with the signed-in email, e.g. `Remote-Email`. Only set this when Wishes is reachable *only* through your proxy. |
| `DISABLE_PASSWORD_LOGIN` | `true` for SSO-only. |
| `PRICE_CHECK_HOURS` | Price re-check interval per item (default 24, `0` off). |
| `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`, `AI_BASE_URL` | Fallbacks for the Admin AI settings. |

### Tinyauth

Tinyauth works either way:
- **OIDC**: if your Tinyauth version acts as an OIDC provider, register a client with the redirect URI above and set the `OIDC_*` variables.
- **Forward auth**: put Wishes behind Tinyauth in your proxy and set `TRUSTED_EMAIL_HEADER=Remote-Email`.

## Develop

```bash
npm install
npm run dev
```

Data goes to `./data/wishes.db`. Schema migrations live in `src/lib/db.ts` (append a new entry to `MIGRATIONS`).

### Where things are

- `src/lib/access.ts` – who can see which lists (the sharing rules)
- `src/lib/scrape/` – link autofill; add a store in `stores.ts`
- `src/lib/ai.ts` – AI providers
- `src/lib/prices.ts` + `src/instrumentation.ts` – background price checks
- `src/app/actions/` – every form action
