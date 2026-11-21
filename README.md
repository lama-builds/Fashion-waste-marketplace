# Fashion Waste Marketplace

A marketplace for leftover fabric, unsold stock and pre-loved garments in Egypt. Two roles only: **Buyer** and **Seller**.

| Folder | Contents |
|---|---|
| `backend/public/` | The website (plain HTML/CSS/JS). It loads its data from the API (`GET /api/bootstrap`) and sends changes with `fetch`, using the login cookie. |
| `backend/` | Express API for Vercel. `api/index.js` is the only Vercel function; the code it uses is in `server/`. |
| `sql/` | Database scripts for the Supabase SQL Editor (see "Database setup"). |
| `docs/` | ERD diagrams (Mermaid), AI integration notes, project plan and page list spreadsheets. |

## Deploying the backend on Vercel

One Vercel project serves both the website (`backend/public`) and the API (`/api/*`).

### 1. Database setup (Supabase)
1. Create a project at supabase.com and save the database password.
2. Open **SQL Editor** and run these files from `sql/`, in this order:
   1. `01_schema_original.sql`
   2. `02_auth_migration.sql`
   3. `04_two_roles_migration.sql`
   4. `05_seed_categories.sql` (adds the four starting categories; safe to run again)
   5. `03_stage2_ai_dashboards.sql` (needed: saved listings and buyer preferences)
3. Click **Connect**, copy the **Transaction pooler** string (port **6543**) and put your password in it. Do not add `?sslmode=...`. URL-encode special characters in the password.

### 2. Vercel settings
In your Vercel project open **Settings**:
- **General → Root Directory:** `backend`
- **General → Framework Preset:** Other. Leave Build Command and Install Command empty. Set **Output Directory** to `public`.
- **General → Node.js Version:** 24.x
- **Environment Variables** (all environments):
  - `DATABASE_URL`: the pooler string from step 1
  - `JWT_SECRET`: at least 32 random characters. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

Then open **Deployments**, choose the latest deployment and click **Redeploy**. Variables only apply to new deployments.

### 3. Check it
- `https://YOUR-DOMAIN/api/health` should show `{"ok":true}`.
- `https://YOUR-DOMAIN/` shows the marketplace. `/api/categories` lists the four starting categories.
- If you get a 500 error, open the deployment's **Logs**. A missing or too-short `JWT_SECRET`, or a missing `DATABASE_URL`, is named there.

### Local development
Copy `backend/.env.example` to `backend/.env`, fill in both values, then run `npm install` and `npm run dev` inside `backend/`.

## Status
- Pages, API and database are connected: sign up / log in (cookie session), listings with photos, orders, saved items, profile and role, buyer preferences, impact figures.
- Tested: SQL on the real Supabase schema; the pages in a real browser against a simulated API with the same response shapes.
- Photos and avatars are resized in the browser and stored in the database as small JPEGs.
- The AI tools ("Ask Claude") need the Claude connection that is only available inside claude.ai; on this site they use the built-in rules and are labelled "Simulated · rules".
- No payments are taken. Buyers and sellers arrange payment and pickup on WhatsApp.
- Not done yet: login rate limiting.
