# Lesschat

Instagram keyword automation: reply to comments containing your keywords and
automatically DM those people your link. Built to replace the one slice of
Manychat that actually gets used.

- **Auto-reply to comments** matching keywords, on all posts / specific posts /
  posts from now on
- **Auto-DM the commenter** with your link — no prior conversation needed
- **Inbox** — an activity log of every automation run, plus read-only DM threads

Single-tenant (one Instagram account). Instagram only; the provider boundary in
`lib/instagram/` is where TikTok would slot in later.

---

## How the DM works

Meta has a first-class mechanism for this called a **Private Reply**: you POST
to `/{ig-user-id}/messages` with `recipient: { comment_id }` and Meta delivers a
DM to the commenter with no existing conversation. Its limits are enforced by
Meta and shape the whole design:

| Rule | How this app handles it |
|---|---|
| One private reply per comment, ever | `comment_event.comment_id` is UNIQUE — duplicate webhooks cannot double-send |
| Must be sent within 7 days | Events carry `expires_at`; past it they are marked `dead`, not retried |
| Account must be Professional | Checked at login by Instagram itself |
| 2 messaging calls/sec per account | The retry sweeper paces itself at ~550ms |

---

# Setup — start here

This is the full path from a fresh clone to a working automation. Budget about
an hour; most of it is the Meta dashboard, not the code.

You will need: an Instagram account you control, a Meta (Facebook) account, a
[Vercel](https://vercel.com) account (the database is provisioned through it,
via Neon), and Node 20+ with `pnpm`.

The order matters. Meta needs a live HTTPS URL before it will accept your
webhook, so the app gets deployed **before** the Meta config is finished.

---

## Step 1 — Convert your Instagram account to Professional

In the Instagram mobile app: **Settings → Account type and tools → Switch to
professional account**. Pick **Business** or **Creator**.

Personal accounts cannot use this API at all. If login later fails with a vague
permissions error, this is almost always why.

---

## Step 2 — Clone and install

```bash
git clone <this-repo> manychat
cd manychat
pnpm install
```

If you plan to use the GitHub Actions cron (Step 9), push this to your own
GitHub repo now — the workflow only runs from a repo you control.

---

## Step 3 — Create the database

Create the Neon database **through Vercel**, not on neon.tech directly — this
links it to your project automatically and saves a step later in Step 7.

1. Sign in at [vercel.com](https://vercel.com).
2. **Storage → Create Database → Neon** (Postgres, powered by Neon).
3. Name it and create it. Vercel provisions the Neon project for you.
4. Copy the connection string it gives you — the pooled one, which looks like:
   `postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require`

Keep it handy for Step 5. If you connect the database to your Vercel project
now, Vercel will also offer to inject `DATABASE_URL` into your project's
environment variables automatically, which saves you re-entering it in Step 7.

---

## Step 4 — Create the Meta app (developer side)

Everything here happens at
[developers.facebook.com](https://developers.facebook.com). Log in with the
Facebook account that will own the app.

### 4a. Create the app

1. **My Apps → Create App**.
2. **App name**: anything (e.g. `comment-to-dm`). **Contact email**: yours.
3. On the use-case picker, click the **All** tab and choose **Manage
   messaging and content on Instagram**. This is the use case this app is
   built around — don't use a generic "Business" or "Other" tile if you see
   one instead.
4. Create the app. You land on the app dashboard.

### 4b. Set up Instagram Login inside the use case

1. In the left sidebar, open **Use cases**, then click **Customize** on the
   *Manage messaging and content on Instagram* use case you just added.
2. Inside it, open **API setup with Instagram login**. This is the flow this
   app uses — **not** Facebook Login, and **not** the older "API setup with
   Facebook login". Choosing the Facebook variant produces tokens this app
   cannot use.

### 4c. Get your App ID and App Secret

> The **Instagram** app ID/secret are what you need — not the ones on
> *App settings → Basic*.

Same screen as above: **Use cases → Customize use case → API setup with
Instagram login**. In the step titled **"1. Generate access tokens"** (or the
*Business login settings* panel next to it) you will find:

- **Instagram app ID**
- **Instagram app secret** — click **Show**, re-enter your Facebook password,
  then copy it.

Save both. They become `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET`.

If the *App settings → Basic* page fails to render (see the note in Step 4g),
this Instagram use-case panel is also the only place you can read the secret —
which is another reason to take it from here.

### 4d. Permissions the app requests

At login the app asks Instagram for exactly three scopes (see
`lib/instagram/oauth.ts`):

- `instagram_business_basic` — profile and media
- `instagram_business_manage_comments` — read comments, post replies
- `instagram_business_manage_messages` — send the private-reply DM

In Development Mode with your own tester account these are granted on the
consent screen with no review. You only request **Advanced Access** for them
under *App Review → Permissions and features* if you later open the app to
accounts other than your own.

### 4e. Add yourself as an Instagram Tester

While the app is in **Development mode**, only tester accounts can authorise it.

1. **App roles → Roles → Add people → Instagram Tester**.
2. Enter your Instagram username and send the invite.
3. Accept it in the Instagram app: **Settings → Apps and websites → Tester
   invites → Accept**.

**No App Review is needed** while the app stays in Development Mode and you use
your own tester account. That is the entire reason this is a weekend project
rather than a six-week one.

### 4f. Redirect URI and webhook come later

The remaining Meta fields — OAuth redirect URI and the webhook callback — need
your deployed HTTPS URL, so they are done in Step 8 after deploying.

### 4g. Privacy Policy URL — paste it in the App Review flow

Meta asks for a Privacy Policy URL, a Terms of Service URL and a Data Deletion
URL. Normally these live under **App settings → Basic**.

**That page currently fails to render for many apps (ongoing Meta bug) — the
fields either never load or refuse to save.** Do not fight it.

Instead, supply the URLs through the **App Review** flow: **App Review →
Requests** (or **Permissions and features → Request advanced access**). When you
start a submission, Meta asks for the same Privacy Policy / Terms / Data
Deletion URLs inline in that form — **paste them there**. Meta accepts the values
submitted through App Review, and they propagate to the app record even though
Basic Settings will not display them.

You only need this once you go beyond Development Mode. For a personal
single-account setup on your own tester account, you can skip it entirely until
you decide to publish.

---

## Step 5 — Environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Where it comes from |
|---|---|
| `INSTAGRAM_APP_ID` | Step 4c |
| `INSTAGRAM_APP_SECRET` | Step 4c |
| `WEBHOOK_VERIFY_TOKEN` | Invent any random string. You paste the *same* value into Meta in Step 8. |
| `TOKEN_ENC_KEY` | `openssl rand -hex 32` — must be exactly 64 hex chars (AES-256 key for the stored token) |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `CRON_SECRET` | `openssl rand -hex 32` |
| `DATABASE_URL` | Step 3 |
| `APP_URL` | `http://localhost:3000` for now; your Vercel URL after Step 6 |

Generate the three secrets:

```bash
openssl rand -hex 32   # run three times, one per secret
```

`APP_URL` must never have a trailing slash — the OAuth redirect URI is built
from it and Meta compares it character for character.

---

## Step 6 — Run the migrations

> **Gotcha:** `drizzle-kit` loads `.env`, **not** `.env.local`. Without this
> copy, `pnpm db:migrate` fails with `[x] url: undefined` even though your
> `.env.local` is filled in correctly. Both files are gitignored.

```bash
cp .env.local .env
pnpm db:migrate
```

This creates the `account`, `automation`, `webhook_event`, `comment_event` and
inbox tables in Neon. Verify with `pnpm db:studio` if you like — it reads `.env`
too. Whenever you change `.env.local`, re-copy it if you plan to run a `db:*`
command.

---

## Step 7 — Deploy

Webhooks require a public HTTPS URL, so deploy before finishing the Meta config.

```bash
pnpm dlx vercel deploy --prod
```

The first run is interactive — it asks you to log in and link or create the
Vercel project. Answer the prompts, then note the deployment URL it prints.

Then, in the **Vercel dashboard → your project → Settings → Environment
Variables**, add every variable from `.env.local` — with one change:

- `APP_URL` = your deployed URL, e.g. `https://your-app.vercel.app`
  (HTTPS, no trailing slash)

Redeploy so the new values take effect:

```bash
pnpm dlx vercel deploy --prod
```

Finally, check **Settings → Deployment Protection** is **off** for production.
If it is on, Vercel answers 401 to anyone without a session cookie — which
includes Meta's webhook delivery and the cron callers, and both will fail
silently.

---

## Step 8 — Point Meta at your deployed app

Back in the Meta dashboard, with your real URL in hand.

### 8a. OAuth redirect URI

**Instagram → API setup with Instagram login → Business login settings**:

- **Redirect URI**: `https://your-app.vercel.app/api/auth/instagram/callback`

It must match `APP_URL` exactly — same scheme, same host, no trailing slash, no
`www` mismatch. This is the single most common cause of a failed login.

### 8b. Webhook

Same page, or **Instagram → Webhooks**:

- **Callback URL**: `https://your-app.vercel.app/api/webhooks/instagram`
- **Verify token**: the exact `WEBHOOK_VERIFY_TOKEN` string from Step 5
- Click **Verify and save** — Meta calls your `GET` handler and expects the
  challenge echoed back. A failure here means the app is not deployed, the URL
  is wrong, or the token does not match.
- Then **subscribe to the fields**: `comments` and `messages`.

The app itself calls `/me/subscribed_apps` when you log in, so the per-account
subscription is handled for you — you only need the app-level field
subscriptions above.

---

## Step 9 — Scheduled jobs

Two paths, depending on your Vercel plan.

**Vercel Pro** — add the sub-daily jobs to `vercel.json` alongside the existing
daily one:

```json
{
  "crons": [
    { "path": "/api/cron/process-events", "schedule": "*/2 * * * *" },
    { "path": "/api/cron/sync-inbox",     "schedule": "*/15 * * * *" },
    { "path": "/api/cron/refresh-token",  "schedule": "0 4 * * *" }
  ]
}
```

**Vercel Hobby** (the default, and what this repo ships with) — sub-daily crons
are not available, so `.github/workflows/cron.yml` drives them from GitHub
Actions instead. Add two repo secrets under **Settings → Secrets and variables →
Actions**:

- `APP_URL` — `https://your-app.vercel.app` (no trailing slash)
- `CRON_SECRET` — the same value as the Vercel env var

The daily `refresh-token` job stays in `vercel.json` either way. **If it stops
running, the 60-day token lapses and every automation silently dies.**

---

## Step 10 — Use it

1. Open `https://your-app.vercel.app`.
2. Click **Continue with Instagram**, authorise with your tester account.
3. **Automations → New**: name it, add keywords, write the comment replies and
   the DM, pick the post scope.
4. Set the status to **live** and publish.
5. Comment your keyword on the target post from a *different* Instagram account
   (self-comments are ignored by design) and watch the **Inbox** activity log.

---

## Local development

```bash
pnpm dev
```

Webhooks cannot reach `localhost`, so comment events will not fire locally.
Either use a Vercel preview deployment, or tunnel:

```bash
pnpm dlx ngrok http 3000
```

then set `APP_URL` to the ngrok URL and point the Meta webhook and redirect URI
at it. The UI, database and matcher logic all work fine locally without a
tunnel.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| Login bounces back with an error | Redirect URI mismatch (Step 8a), or `APP_URL` has a trailing slash |
| "Invalid platform app" on login | You set up Facebook Login instead of Instagram Login (Step 4b) |
| Webhook "Verify and save" fails | App not deployed, wrong callback path, or `WEBHOOK_VERIFY_TOKEN` differs between Meta and Vercel |
| Login succeeds, nothing ever fires | Field subscriptions missing (Step 8b), or the automation is still `draft` |
| Comment reply posts, DM never arrives | Private-reply window expired (7 days), or the comment already had a private reply |
| Everything stopped after ~2 months | The daily `refresh-token` cron stopped and the token lapsed |
| `Missing environment variable X` | That variable is not set in Vercel — `.env.local` is not uploaded for you |
| Basic Settings page blank / won't save | Known Meta bug — submit the URLs via App Review instead (Step 4g) |
| Webhook or cron returns 401 from Vercel | Vercel **Deployment Protection** is on — disable it for production, or Meta and GitHub Actions cannot reach the endpoints |
| `pnpm db:migrate` says `url: undefined` | You only have `.env.local`; drizzle-kit reads `.env` (Step 6) |

---

## Architecture

```
Instagram comment
      ↓  webhook (field: "comments")
POST /api/webhooks/instagram
      ↓  verify signature → INSERT raw event → 200 (fast)
      ↓  after() — runs once the response is already sent
  match automation → public comment reply → private-reply DM
      ↓
Cron sweeper retries anything left pending or failed
```

The webhook handler acknowledges before doing any work, because Meta throttles
and eventually disables slow endpoints. Durability comes from the
`webhook_event` table plus the cron sweeper rather than from a queue service.

| Path | Role |
|---|---|
| `app/api/webhooks/instagram/route.ts` | Receives events. The critical file. |
| `lib/automation/matcher.ts` | Keyword and scope matching. Pure, fully unit-tested. |
| `lib/automation/processor.ts` | Fires the reply and the DM; writes the activity log. |
| `lib/instagram/client.ts` | Graph API calls. |
| `lib/instagram/oauth.ts` | Business Login and the 60-day token lifecycle. |
| `db/schema.ts` | Drizzle schema. |

### Cron jobs

| Schedule | Job | Why |
|---|---|---|
| every 2–5 min | `process-events` | Retries failed sends within the 7-day window |
| every 15 min | `sync-inbox` | Backfills DM threads and refreshes the post picker |
| daily 04:00 | `refresh-token` | Renews the 60-day token — **if this stops, everything silently stops** |

---

## Commands

```bash
pnpm dev          # dev server
pnpm test         # unit tests
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
pnpm db:generate  # generate a migration after editing db/schema.ts
pnpm db:migrate   # apply migrations
pnpm db:studio    # browse the database
```

---

## Notes and gotchas

- **Keyword matching defaults to whole-word**, so `link` does not fire on
  `linkedin`. Switch to "anywhere in the comment" per automation if you want the
  looser behaviour.
- **Comment replies rotate** between the variants you write. Posting an
  identical reply every time is the fastest way to get flagged as spam.
- **Self-comments are ignored**, otherwise the bot replies to its own replies
  forever.
- **The Inbox is read-only.** Replying from here would run into Meta's 24-hour
  messaging window and its `human_agent` rules; the Instagram app has none of
  those problems.
- **DM history beyond 20 messages** exists only in your own database — the
  Instagram API caps `GET /me/conversations` at the 20 most recent messages per
  thread, which is why every incoming message is mirrored locally.
