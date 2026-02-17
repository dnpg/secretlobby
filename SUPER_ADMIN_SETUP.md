# Super Admin Setup

How to create the initial platform administrator (Super Admin) so you can log in to the admin panel and manage users, invitations, emails, and settings.

## How it works

- **Super Admin** is the app at `admin.secretlobby.co` (or `http://localhost:3003` in dev). Only users who have a **Staff** record can log in.
- A dedicated script creates that first Staff user from `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD`:
  - A **User** (with that email and hashed password)
  - A **Staff** record (OWNER) so the user can log in to Super Admin
  No Account is created; the user can create or join accounts later from the console if they need to.
- Login uses **email + password**; the app then checks that the user has a Staff record. No Staff → no access.

## Local development

**Option A – Super Admin only (recommended)**  
1. Set in **repo root** `.env`:
   ```bash
   SUPER_ADMIN_EMAIL=admin@yourdomain.com
   SUPER_ADMIN_PASSWORD=your-secure-admin-password
   ```
2. Run: `pnpm db:create-super-admin`
3. Log in at the Super Admin app (e.g. http://localhost:3003) with that email and password.

**Option B – Full seed (demo data + Super Admin)**  
If you want demo users, sample lobbies, etc., run `pnpm db:seed` instead. The seed also creates the Super Admin user when those env vars are set. Use this only for local dev.

To change the Super Admin password later, update `.env` and run `pnpm db:create-super-admin` again (or `pnpm db:seed` if you use the full seed).

## Production

**Do not run the full seed in production** (it creates demo data). Use only the Super Admin script:

1. Set in your **production environment** (e.g. secrets / env in your deploy pipeline):
   ```bash
   SUPER_ADMIN_EMAIL=admin@yourdomain.com
   SUPER_ADMIN_PASSWORD=your-strong-secure-password
   ```
2. Run **migrations** (if not already): `pnpm db:migrate:deploy`
3. Run **once** (after deploy or from a one-off job):  
   `pnpm db:create-super-admin`  
   Ensure `DATABASE_URL`, `SUPER_ADMIN_EMAIL`, and `SUPER_ADMIN_PASSWORD` are available to that command (e.g. inject them in the run environment).
4. Log in at your Super Admin URL (e.g. https://admin.secretlobby.co) with that email and password.
5. After first login, add more staff from the Super Admin UI (Staff section) if needed.

## Troubleshooting

| Problem | What to do |
|--------|------------|
| “Invalid email or password” | User missing or wrong password. Set `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` and run `pnpm db:create-super-admin` (env must be visible to the script, e.g. repo root `.env` locally). |
| “This account does not have Super Admin access…” | User exists but has no Staff record. Run `pnpm db:create-super-admin` with the same env vars; it upserts the Staff record. |
| Script says “DATABASE_URL is not set” or “Set SUPER_ADMIN_EMAIL…” | Env vars are not set where the script runs. Locally use repo root `.env`; in production pass them into the process (e.g. `SUPER_ADMIN_EMAIL=... SUPER_ADMIN_PASSWORD=... pnpm db:create-super-admin`). |

## Security (production)

- Use a **strong password** (e.g. 20+ chars, mixed case, numbers, symbols).
- Set `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` via your deployment/secrets system, not a committed file.
- After first login, add other Staff users from the UI; you can then rotate the initial admin password if you want.
