import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing required Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY",
  );
}

const globalForSupabase = globalThis;

export const supabase =
  globalForSupabase.__algobuddySupabase ||
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      // Prevent the client SDK from persisting sessions to localStorage.
      // OAuth flows will be bridged to the server via an explicit endpoint.
      persistSession: false,
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForSupabase.__algobuddySupabase = supabase;
}
