# TNS Opus

TNS Opus is the operations application for TNS Community. It covers attendance, productivity, finance, documents, policies, notifications, and role-based dashboards.

## Development

```bash
bun install --frozen-lockfile
bun run dev
```

Quality checks:

```bash
bun run lint
bun run typecheck
bun run build
```

## GitHub App

The repository deploys an installable static application to GitHub Pages through [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml). The Pages build keeps normal Lovable and Cloudflare builds unchanged while generating a repository-scoped SPA in `dist/client`.

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

Set the same application root as the production Site URL when GitHub Pages is the primary host. Email confirmation, password recovery, and Google sign-in derive their callback URLs from the deployed repository path.

Only Supabase publishable values belong in browser builds. Never add a service-role or secret key to `.env`, GitHub variables, or any `VITE_*` variable.

## Database Migrations

Apply the checked-in Supabase migrations before treating a release as production-ready. From an authenticated Supabase CLI session:

```bash
bunx supabase link --project-ref <project-ref>
bunx supabase db push
```

The migration in [`supabase/migrations`](supabase/migrations) adds the server-side authorization, account activation, attendance, finance, notification, role-management, and storage protections used by the application. The browser includes temporary compatibility fallbacks so it can still connect while an existing project is being migrated, but those fallbacks are not a substitute for applying the database migration.

## Installable App

The Pages release includes a web app manifest, service worker, offline shell, iOS icon, maskable Android icons, and an in-app installation control. The icons and interface branding are derived from the supplied TNS Community wordmark and mark.
