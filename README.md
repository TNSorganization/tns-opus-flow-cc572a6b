# TNS Opus

TNS Opus is the operations application for TNS Community. It covers attendance, productivity, finance, products, logistics, programs, marketing, documents, policies, notifications, and role-based dashboards.

## Development

```bash
bun install --frozen-lockfile
bun run dev
```

Quality checks:

```bash
bun run lint
bun run typecheck
bun run test
bun run build
```

## GitHub App

The repository deploys a static application to GitHub Pages through [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml). The Pages build generates a repository-scoped SPA in `dist/client`, while the standard build can also produce a Nitro server deployment.

Production address:

- `https://tnsorganization.github.io/tns-opus-flow-cc572a6b/`

The workflow runs automatically after a push to `main`. In GitHub, the repository's **Settings -> Pages -> Build and deployment** source must be set to **GitHub Actions**.

To verify the Pages artifact locally:

```bash
GITHUB_PAGES=true GITHUB_REPOSITORY=TNSorganization/tns-opus-flow-cc572a6b bun run build
```

## Supabase URLs

Add this production pattern in **Supabase -> Authentication -> URL Configuration -> Redirect URLs**:

```text
https://tnsorganization.github.io/tns-opus-flow-cc572a6b/**
```

Set the same application root as the production Site URL when GitHub Pages is the primary host. Email confirmation and password recovery return through the explicit `/callback` route. The callback accepts Supabase PKCE codes, implicit tokens, and hashed OTP links so current and older email templates remain compatible.

The checked-in `supabase/config.toml` declares the production Site URL and redirect allowlist. Preview changes with `bunx supabase config diff --project-ref <project-ref>`, then apply them with `bunx supabase config push --project-ref <project-ref>` after reviewing the diff.

Only Supabase publishable values belong in browser builds. Never add a service-role or secret key to `.env`, GitHub variables, or any `VITE_*` variable.

## Database Migrations

Apply the checked-in Supabase migrations before treating a release as production-ready. From an authenticated Supabase CLI session:

```bash
bunx supabase link --project-ref <project-ref>
bunx supabase db push
```

The first Auth account is atomically bootstrapped as the workspace CEO and does not require a matricule, allowing that administrator to issue matricules to later users. The exact Auth email `tnsorganization@gmail.com` is also a durable TNS owner account; that rule reads the protected `auth.users.email` field, not editable user metadata.

The migration in [`supabase/migrations`](supabase/migrations) adds the server-side authorization, account activation, attendance, finance, notification, role-management, and storage protections used by the application. The browser includes temporary compatibility fallbacks so it can still connect while an existing project is being migrated, but those fallbacks are not a substitute for applying the database migration.

## Fresh Releases

The Pages release includes the web app manifest, iOS icon, maskable Android icons, and interface branding derived from the supplied TNS Community wordmark and mark. Offline caching is intentionally disabled for now: the previous service worker could keep an outdated authentication screen after a deployment. Every visit therefore loads the current GitHub release, and a small retirement worker removes caches left by older installations.
