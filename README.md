# Fashion Waste Marketplace

A marketplace for leftover fabric, unsold stock and pre-loved garments in Egypt. Two roles only: **Buyer** and **Seller**.

| Folder | Contents |
|---|---|
| `prototype/` | Static clickable prototype (HTML/CSS/JS, sample data in the browser). Open `prototype/index.html` via any static server, e.g. `python3 -m http.server`. |
| `backend/` | Express API for Vercel (register/login, listings, profiles, categories) and a React fetch example. Copy `.env.example` to `.env`, then `npm install` and `npm run dev`. |
| `sql/` | Run in this order in the Supabase SQL Editor: `01` schema, `02` login migration, `03` stage-2 tables, `04` two-roles migration. |
| `docs/` | ERD diagrams (Mermaid), AI integration notes, project plan and page list spreadsheets. |

## Status
- The prototype and the SQL were tested (SQL on Postgres 16).
- The Express app has not been run end to end, and nothing has been tried against a real Supabase project.
- AI features in the prototype are labelled "Live AI · Claude" or "Simulated · rules" on every result.
