# PizzaHub API

Express 5 + TypeScript API for PizzaHub. This repository is the backend only; the Next.js client lives in the sibling `pizzahub-client` repository.

## Status

Phase 0 (repo setup) complete. The API is implemented in Phase 2 of the project plan.

## Planned stack

- Express 5 (Vercel zero-config entry: `src/app.ts` default export)
- TypeScript (ES modules)
- MongoDB + Mongoose
- Better Auth JWT verification via JWKS (issued by the Next.js client)
- Stripe Checkout + webhook for vendor Premium
- ImgBB image hosting
- Zod validation, Helmet, CORS, rate limiting

## Development

```bash
npm install
npm run dev
```

Local env names are documented in `.env.example`. Never commit `.env` files.

## Project plan

See `pizzahub-client/docs/PROJECT_PLAN.md` for the full cross-project plan.
