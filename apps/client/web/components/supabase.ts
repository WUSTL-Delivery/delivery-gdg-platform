import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Lazily construct the secret-key (server-only) client on first use rather than at module
// import. `next build` imports every route handler while collecting page data,
// and a module-scope createClient() throws "supabaseUrl is required" when the
// env isn't present at build time (e.g. inside a Docker image build). Deferring
// construction keeps the build env-free; the real values are read at runtime.
let client: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set"
      );
    }
    client = createClient(url, key);
  }
  return client;
}

// Proxy so existing call sites (`supabase.from(...)`) keep working unchanged.
const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const real = getSupabase();
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export default supabase;
