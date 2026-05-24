import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing required Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY",
  );
}

function createAuthClient(cookieStore) {
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, {
            ...options,
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: options?.path ?? "/",
          });
        }
      },
    },
  });
}

export async function POST(req) {
  try {
    const cookieStore = await cookies();
    const supabase = createAuthClient(cookieStore);

    const body = await req.json();
    const { access_token: accessToken, refresh_token: refreshToken } = body || {};

    if (!accessToken || !refreshToken) {
      return new Response(
        JSON.stringify({ success: false, message: "Missing tokens" }),
        { status: 400 },
      );
    }

    // Use server client to set the session via HttpOnly cookies.
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      console.error("Bridge setSession error:", error);
      return new Response(
        JSON.stringify({ success: false, message: error.message }),
        { status: 500 },
      );
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    console.error("Bridge error:", err);
    return new Response(
      JSON.stringify({ success: false, message: "Internal server error" }),
      { status: 500 },
    );
  }
}
