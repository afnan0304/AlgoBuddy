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

    // Parse JSON body safely
    const body = await req.json();
    const { email, password, captchaToken, action, name } = body || {};

    // Validate required fields
    if (!email || !password) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Email and password are required",
        }),
        { status: 400 },
      );
    }
    if (!captchaToken) {
      return new Response(
        JSON.stringify({ success: false, message: "Captcha token missing" }),
        { status: 400 },
      );
    }

    // Verify Turnstile token for both signup and login
    const verifyRes = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret: process.env.TURNSTILE_SECRET_KEY,
          response: captchaToken,
        }),
      },
    );
    const verifyData = await verifyRes.json();
    if (!verifyData.success) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Captcha verification failed",
        }),
        { status: 400 },
      );
    }

    if (action === "signup") {
      // Create Supabase user with metadata
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: name },
        },
      });
      if (error) {
        return new Response(
          JSON.stringify({ success: false, message: error.message }),
          { status: 400 },
        );
      }
      return new Response(
        JSON.stringify({
          success: true,
          message: "Signup successful. Verification email sent.",
          trigger: true,
        }),
        { status: 200 },
      );
    } else if (action === "login") {
      // Verify captcha, then perform login server-side
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return new Response(
          JSON.stringify({ success: false, message: error.message }),
          { status: 401 },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Login successful",
        }),
        { status: 200 },
      );
    }

    // Invalid action
    else {
      return new Response(
        JSON.stringify({ success: false, message: "Invalid action" }),
        { status: 400 },
      );
    }
  } catch (err) {
    console.error("API Error:", err);
    return new Response(
      JSON.stringify({ success: false, message: "Internal server error" }),
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = createAuthClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new Response(
        JSON.stringify({ authenticated: false, user: null }),
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Return a minimal, non-sensitive DTO. Do not include tokens or any
    // raw authentication credentials.
    const safeUser = {
      id: user.id,
      email: user.email,
      role: user?.role ?? null,
      user_metadata: {
        display_name: user?.user_metadata?.display_name ?? null,
      },
    };

    return new Response(
      JSON.stringify({ authenticated: true, user: safeUser }),
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("Session fetch error:", err);
    return new Response(
      JSON.stringify({ authenticated: false, user: null }),
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function DELETE() {
  try {
    const cookieStore = await cookies();
    const supabase = createAuthClient(cookieStore);
    await supabase.auth.signOut();

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200 },
    );
  } catch (err) {
    console.error("Logout error:", err);
    return new Response(
      JSON.stringify({ success: false, message: "Logout failed" }),
      { status: 500 },
    );
  }
}
