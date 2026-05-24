import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

// Server-side OAuth callback: exchanges the provider code for tokens, sets
// HttpOnly session cookies via the server Supabase client, then redirects the
// user back to the app. This is a scaffold that attempts a token exchange
// against Supabase's token endpoint; depending on your Supabase project
// configuration you may need to adjust the Authorization header or include a
// client id/secret in env.
export async function GET(req) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const from = url.searchParams.get("from") || "/dashboard";

    if (!code) {
      return new Response("Missing code", { status: 400 });
    }

    if (!serviceRole) {
      console.error("SUPABASE_SERVICE_ROLE_KEY not configured; cannot exchange code server-side");
      // Fallback: redirect to login so client-side bridge can handle session if present.
      const redirectUrl = new URL("/login", url.origin);
      redirectUrl.searchParams.set("error", "server_oauth_not_configured");
      return Response.redirect(redirectUrl);
    }

    // Exchange authorization code for tokens using Supabase token endpoint.
    const tokenRes = await fetch(`${supabaseUrl}/auth/v1/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // Using Basic auth with anon key + service role as a best-effort default.
        Authorization: `Basic ${Buffer.from(`${supabaseAnonKey}:${serviceRole}`).toString("base64")}`,
      },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_to: `${url.origin}/api/auth/callback` }),
    });

    if (!tokenRes.ok) {
      const txt = await tokenRes.text();
      console.error("Token exchange failed:", tokenRes.status, txt);
      const redirectUrl = new URL("/login", url.origin);
      redirectUrl.searchParams.set("error", "token_exchange_failed");
      return Response.redirect(redirectUrl);
    }

    const tokenData = await tokenRes.json();
    const { access_token: accessToken, refresh_token: refreshToken } = tokenData || {};

    if (!accessToken || !refreshToken) {
      console.error("Token exchange returned incomplete tokens", tokenData);
      const redirectUrl = new URL("/login", url.origin);
      redirectUrl.searchParams.set("error", "invalid_token_response");
      return Response.redirect(redirectUrl);
    }

    // Set server-side session cookies using the SSR client.
    const cookieStore = await cookies();
    const supabase = createAuthClient(cookieStore);

    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) {
      console.error("setSession error:", error);
      const redirectUrl = new URL("/login", url.origin);
      redirectUrl.searchParams.set("error", "set_session_failed");
      return Response.redirect(redirectUrl);
    }

    // Successful: redirect user back to the original destination.
    const returnUrl = new URL(from, url.origin);
    return Response.redirect(returnUrl);
  } catch (err) {
    console.error("OAuth callback error:", err);
    const url = new URL(req.url);
    const redirectUrl = new URL("/login", url.origin);
    redirectUrl.searchParams.set("error", "internal_callback_error");
    return Response.redirect(redirectUrl);
  }
}
