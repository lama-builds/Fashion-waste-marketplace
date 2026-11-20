# AI integration: what is live, what is simulated, what is still needed

## In the prototype today
| Feature | Live (only inside the Claude preview, after the viewer allows it) | Simulated fallback (always works) |
|---|---|---|
| Fabric recognition | Claude vision reads the photo (confidence capped at 85%) | Colour/texture statistics on a 96px copy, capped at 70% |
| Value estimate | Optional short second opinion from Claude | Sample price table x condition x bulk factor |
| Upcycling | Optional extra ideas from Claude | Curated idea lists per fabric |
| Smart matching | Optional re-ranking by Claude (AI Studio) | Weighted rules (fabric, price, quantity, city, condition) |
| Search assistant | Claude turns a sentence into filters | Keyword/pattern parser, English and Arabic |

Every result shows a chip: "Live AI · Claude" or "Simulated · rules", plus the reason when it fell back.

## To make it real outside the preview (not done)
1. A backend endpoint (Supabase Edge Function or Vercel serverless) that holds the model API key and exposes: POST /ai/recognize (image), /ai/search (text), /ai/value, /ai/upcycle, /ai/match. The page must never hold the key.
2. Replace `live()` in `ai.js` with `fetch('/ai/...')`. Keep the same JSON shapes; the sanitising code already validates them.
3. Real value estimation needs sold-price history (the `orders` table) instead of the sample price table.
4. Fabric recognition needs a labelled textile photo set to measure accuracy. A general vision model cannot confirm fibre content.
5. Impact numbers need verified, fibre-specific factors. Current ones are placeholders (see Impact page, Assumptions).
6. Add rate limiting, image size limits and a privacy notice before sending user photos to any model.
