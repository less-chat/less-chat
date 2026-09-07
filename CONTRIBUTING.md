# Contributing

This is a small, single-tenant app, so the process is lightweight. This guide
covers developing a change and getting it merged. For first-time environment
setup (accounts, `.env.local`, Meta app config), see [README.md](./README.md)
first — you need a working local setup before any of this is useful.

---

## Before you start

- Make sure `pnpm dev`, `pnpm test`, and `pnpm typecheck` all run clean on
  `main` first. If they don't, that's a separate bug — file an issue rather
  than building on top of it.
- For anything more than a small fix, open an issue or a draft PR describing
  the change before writing much code. The architecture is deliberately
  narrow (see "Where things live" below) and it's cheaper to align on
  approach early than to rework a finished PR.

---

## Workflow

1. **Fork** the repo (or branch directly if you have write access).
2. **Branch off `main`**, named for what it does:
   ```bash
   git checkout -b fix/webhook-retry-off-by-one
   git checkout -b feat/tiktok-provider
   ```
3. **Make the change.** See "Where things live" and "Conventions" below.
4. **Add or update tests** for anything in `lib/` — see "Testing" below.
5. **Run the full check before pushing:**
   ```bash
   pnpm lint && pnpm typecheck && pnpm test
   ```
6. **Commit** with a short, imperative subject line (`Fix retry sweeper race`,
   not `fixed a bug`). Keep unrelated changes out of the commit.
7. **Open a PR against `main`** with:
   - What changed and why (link an issue if there is one).
   - How you tested it — which unit tests you added, and whether you
     exercised it against a real Instagram webhook (most changes to
     `app/api/webhooks/instagram/` or `lib/automation/processor.ts` should be).
   - Any schema change called out explicitly (see "Database changes" below).
8. Address review feedback as new commits; don't force-push over history
   mid-review unless asked to.

There's no CI pipeline yet, so the checks in step 5 are the only gate —
run them for real, don't skip them because "it's a small change."

---

## Where things live

| If you're changing... | It's in |
|---|---|
| What counts as a keyword match | `lib/automation/matcher.ts` — pure functions, no I/O |
| What happens when an event fires (reply + DM + logging) | `lib/automation/processor.ts` |
| Calls to the Instagram Graph API | `lib/instagram/client.ts` |
| Login / token exchange / token refresh | `lib/instagram/oauth.ts` |
| Webhook signature verification | `lib/instagram/webhook-verify.ts` |
| The webhook HTTP endpoint itself | `app/api/webhooks/instagram/route.ts` |
| Scheduled jobs | `app/api/cron/*/route.ts`, wired up in `vercel.json` and `.github/workflows/cron.yml` |
| Database tables | `db/schema.ts`, then `pnpm db:generate` for a migration |
| UI screens | `app/(dash)/` |
| Session / auth cookie handling | `lib/session.ts` |
| Token encryption at rest | `lib/crypto.ts` |

**Adding a second provider (e.g. TikTok):** `lib/instagram/` is the provider
boundary on purpose — the automation matcher and processor are written
against a provider-agnostic shape as much as possible. A new provider should
add `lib/tiktok/` alongside it, not fork the automation logic. If a change
you're making can't avoid leaking Instagram-specific concepts into
`lib/automation/`, that's worth raising in the PR description rather than
working around silently.

---

## Conventions

- **`lib/automation/matcher.ts` stays pure.** No `fetch`, no `db`, no
  `Date.now()` side effects — it's the one file that's fully unit-tested by
  design, and that only works because it doesn't touch the outside world.
  Push impure logic into `processor.ts` instead.
- **Secrets never get logged.** Access tokens go through `lib/crypto.ts`
  before touching the database and should never appear in a `console.log`,
  error message, or thrown exception — Instagram tokens are not something a
  Vercel log line should carry.
- **The webhook handler must stay fast.** `app/api/webhooks/instagram/route.ts`
  verifies, persists, and returns 200 before doing any real work; real work
  happens in `after()`. Meta throttles slow-responding webhooks, so don't add
  synchronous work to the `POST` handler above the `after()` call.
- **Idempotency matters more than elegance.** Webhooks can and will be
  delivered more than once. Anything that sends a message or posts a reply
  needs a uniqueness check backing it (see how `comment_event.comment_id` is
  UNIQUE) — don't rely on "Meta probably won't retry this."
- Follow the existing code style: comments explain *why*, not *what*; prefer
  small named functions over inline logic in route handlers; `import
  "server-only"` at the top of any server-only module (see any file in `lib/`
  for the pattern).

---

## Testing

```bash
pnpm test        # run once
pnpm test:watch  # watch mode
```

- Pure logic (`lib/automation/matcher.ts`, `lib/instagram/webhook-verify.ts`)
  should be covered by unit tests in the adjacent `__tests__/` folder — see
  `lib/automation/__tests__/matcher.test.ts` for the style: one `describe`
  per function, test names that state the behaviour, real-world edge cases
  (emoji, accents, full-width characters) rather than only the happy path.
- Code that talks to Postgres or the Instagram API doesn't have automated
  tests today. If you're changing `processor.ts` or `client.ts`, the practical
  way to verify it is a real run against your own tester account: trigger a
  comment on a live automation and confirm the reply and DM land, or use
  `pnpm dlx ngrok http 3000` per the README to point a real webhook at your
  local server.
- If you find yourself testing something with real API calls repeatedly,
  consider whether it can be refactored so the decision logic is pure and
  testable (see `matcher.ts`) — that's the pattern this codebase follows.

---

## Database changes

1. Edit `db/schema.ts`.
2. Generate the migration:
   ```bash
   pnpm db:generate
   ```
3. Review the generated SQL in `db/migrations/` before committing it — Drizzle
   sometimes proposes a drop-and-recreate where an `ALTER` would do less
   damage to existing data.
4. Apply it locally to confirm it runs clean:
   ```bash
   pnpm db:migrate
   ```
5. Commit the generated `.sql` file and its `meta/` entry alongside your
   schema change — never hand-edit a migration file that's already been
   generated; make a new one instead.
6. Call out in the PR description whether the change is backwards-compatible
   with a running deployment (i.e. can it apply without downtime) — this
   matters because migrations run via `pnpm db:migrate`, not automatically at
   deploy time.

---

## Reporting bugs / requesting features

Open a GitHub issue with:

- What you expected vs. what happened.
- For a bug: steps to reproduce, and whether it happens with a webhook event,
  a cron run, or a UI action.
- Relevant log output if you have it (Vercel function logs, or your local
  terminal) — with any token or secret values redacted first.
