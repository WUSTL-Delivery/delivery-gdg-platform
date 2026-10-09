# Web Client

The customer-facing site (Next.js 16, App Router, Tailwind). It also hosts the `/api/*`
routes, which are the only backend the browser talks to. They read Supabase directly and
call the authoritative server over gRPC.

## Run

```bash
# Easiest: the whole stack from the repo root
./scripts/rebuild.sh            # then open http://localhost:3000

# Or just the web app (needs authoritative running for orders)
cd apps/client/web
npm install
npm run dev
npm run lint
```

When running natively, create `apps/client/web/.env.local`:

| Variable | Notes |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Same value as `SUPABASE_URL` in `deployments/.env` |
| `SUPABASE_SECRET_KEY` | Server-side only. Never use it in a client component |
| `JWT_SECRET` | Signs the `auth-token` cookie |
| `GRPC_SERVER_URL` | Defaults to `localhost:50051` |

## Pages and routes

| Path | What |
|------|------|
| `/` | Landing page |
| `/login` | Sign up / log in (one form, toggles mode) |
| `/dashboard` | Vendor grid (protected by `proxy.ts`) |
| `/dashboard/[vendor]` | Menu, cart, drop-off picker, place order |
| `/order/[id]` | Order tracking, polls every 5 s |
| `POST /api/signup`, `POST /api/signin`, `POST /api/signout` | Auth; sets/clears the `auth-token` JWT cookie |
| `POST /api/orders` | Creates an order via gRPC `InsertOrder` (currently fails, see [status](../../../docs/STATUS.md)) |
| `GET /api/orders/[id]` | Order + items + drop-off, read from Supabase |

## Key files

| Path | What |
|------|------|
| `proxy.ts` | Route protection (Next 16's replacement for `middleware.ts`) |
| `lib/grpc-client.ts`, `proto/` | gRPC client for the authoritative `OrderHandler` |
| `lib/jwt-secret.ts` | JWT key loading |
| `components/supabase.ts` | Lazily created server-side Supabase client |

The full order flow is in [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md).
