# Security policy

BEE is a multi-tenant application: one deployment holds several
organizations' data, separated in software. That makes a bug in the wrong
place a data-exposure bug rather than a crash, which is why this file
exists before the project has any users.

## Reporting a vulnerability

**Do not open a public issue.** Write to **frisonialessia@gmail.com** with
"BEE security" in the subject, and include whatever you have: the endpoint
or file, what you did, what you got back, and — if you have one — a request
that reproduces it.

There is one person behind BEE, so there is no on-call rotation and no
turnaround I can promise honestly. What I can promise: I read every report,
I reply to say I've seen it, and I say plainly whether I'm fixing it, when,
or why not.

If you'd rather not be credited, say so. Otherwise you'll be named in the
commit that fixes it.

## What counts

This is a hobby-scale open-source project, not a bug-bounty program — there
is no money. What is genuinely useful:

- **Cross-tenant access of any kind.** Reading, writing or even counting
  another organization's rows. This is the one that matters most: every
  tenant-scoped query is supposed to go through the helpers in
  `apps/api/app/services/permissions/service.py`, and anything that reaches
  data without them is a real finding.
- **Privilege escalation** between roles inside one organization.
- **Authentication or session flaws** — token forgery, fixation, a session
  that outlives a deactivated user.
- **Injection** (SQL, template, command) or SSRF through the webhook and
  integration paths.
- **Secret exposure** — anything that leaks `JWT_SECRET_KEY`,
  `API_SECRET_KEY`, `SUPPORT_ADMIN_SECRET`, `CRON_SECRET` or a customer's
  integration credentials.

## What is already known, and not a finding

These are documented weaknesses, not surprises. Reporting them is welcome
but they're on the roadmap already — see
[`docs/ROADMAP.md`](docs/ROADMAP.md):

- **The session token lives in `localStorage`**, not an httpOnly cookie, and
  there is no refresh or revocation. Any XSS takes the whole session. Moving
  it is on the roadmap.
- **`script-src` allows `'unsafe-inline'`** in the frontend's CSP, because
  the App Router streams inline bootstrap scripts and the nonce that
  replaces it needs middleware rewriting every response.
- **There is no email verification** on registration yet, so an address can
  be claimed by someone who doesn't own it. This is the current top of the
  roadmap and the reason self-serve signup is gated behind an invite code.
- **The abuse limits are per-process** unless `REDIS_URL` is configured, so
  on a serverless deployment the effective limit is higher than the number
  configured.
- **The public sandbox at `/probar`** deliberately stores its data in the
  browser and calls no API. It is not a tenant and has nothing to breach.

## Deploying BEE yourself

If you run your own instance, [`DEPLOY_CHECKLIST.md`](DEPLOY_CHECKLIST.md)
is the list that matters. The three that bite hardest:

1. `JWT_SECRET_KEY` must be a real secret. The app refuses to start in
   `ENVIRONMENT=production` if it's left at the placeholder — that check is
   deliberate, don't work around it.
2. `BACKEND_CORS_ORIGINS` is a **comma-separated string**, not a JSON array.
   A JSON array parses as one literal origin and fails silently. Include
   every host that actually serves the frontend, including the `www.`
   variant if your apex redirects to it.
3. Keep `API_SECRET_KEY`, `SUPPORT_ADMIN_SECRET` and `CRON_SECRET` distinct
   from each other and from `JWT_SECRET_KEY`. They're separate so that
   leaking one doesn't hand over the others.
