# Fashion Waste Marketplace

A marketplace for leftover fabric, unsold stock and pre-loved garments in Egypt. Two roles only: **Buyer** and **Seller**.

| Folder | Contents |
|---|---|
| `prototype/` | Static clickable prototype (HTML/CSS/JS, sample data in the browser). Open `prototype/index.html` via any static server, e.g. `python3 -m http.server`. |
| `backend/` | Express API for Vercel and a React fetch example. `api/index.js` is the only Vercel function; the code it uses is in `server/`. |
| `sql/` | Database scripts for the Supabase SQL Editor (see "Database setup"). |
| `docs/` | ERD diagrams (Mermaid), AI integration notes, project plan and page list spreadsheets. |

## Deploying the backend on Vercel

The backend is an API only. Its home page (`/`) shows a 404; use `/api/health` to check it.

### 1. Database setup (Supabase)
1. Create a project at supabase.com and save the database password.
2. Open **SQL Editor** and run these files from `sql/`, in this order:
   1. `01_schema_original.sql`
   2. `02_auth_migration.sql`
   3. `04_two_roles_migration.sql`
   4. `03_stage2_ai_dashboards.sql` (optional: the API does not use these tables yet)
3. Click **Connect**, copy the **Transaction pooler** string (port **6543**) and put your password in it. Do not add `?sslmode=...`. URL-encode special characters in the password.

### 2. Vercel settings
In your Vercel project open **Settings**:
- **General → Root Directory:** `backend`
- **General → Framework Preset:** Other. Leave Build Command, Output Directory and Install Command empty.
- **General → Node.js Version:** 20.x
- **Environment Variables** (all environments):
  - `DATABASE_URL`: the pooler string from step 1
  - `JWT_SECRET`: at least 32 random characters. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

Then open **Deployments**, choose the latest deployment and click **Redeploy**. Variables only apply to new deployments.

### 3. Check it
- `https://YOUR-DOMAIN/api/health` should show `{"ok":true}`.
- `https://YOUR-DOMAIN/api/categories` shows an empty list until categories are added.
- If you get a 500 error, open the deployment's **Logs**. A missing or too-short `JWT_SECRET`, or a missing `DATABASE_URL`, is named there.

### Local development
Copy `backend/.env.example` to `backend/.env`, fill in both values, then run `npm install` and `npm run dev` inside `backend/`.

## Status
- The prototype and the SQL were tested (SQL on Postgres 16).
- The Express app has not been run end to end, and nothing has been tried against a real Supabase project.
- AI features in the prototype are labelled "Live AI · Claude" or "Simulated · rules" on every result.
