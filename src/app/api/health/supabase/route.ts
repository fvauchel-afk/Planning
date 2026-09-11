import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatSupabaseErrorDetail } from "@/lib/supabase/errors";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const publishable = Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim());
  const anon = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim());
  let host = "";
  try {
    host = url ? new URL(url).host : "";
  } catch {
    host = "(url invalide)";
  }

  const env = {
    NEXT_PUBLIC_SUPABASE_URL: Boolean(url),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishable,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
    SUPABASE_SERVICE_ROLE_KEY: Boolean(
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
        process.env.SUPABASE_SECRET_KEY?.trim(),
    ),
    supabaseHost: host,
  };
  console.info("[supabase-health] env", env);

  if (!url || (!publishable && !anon)) {
    const payload = {
      ok: false,
      env,
      query: null as null,
      error: "Variables NEXT_PUBLIC_SUPABASE_URL et clé publishable/anon absentes côté serveur.",
    };
    console.error("[supabase-health] missing-env", payload);
    return NextResponse.json(payload, { status: 500 });
  }

  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    const payload = {
      ok: false,
      env,
      query: null as null,
      error:
        "SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_SECRET_KEY) absente. Obligatoire : plus aucun accès table via la clé anon.",
    };
    console.error("[supabase-health] missing-service-role", payload);
    return NextResponse.json(payload, { status: 500 });
  }

  try {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.from("employees").select("id").limit(1);
    if (error) {
      const detail = formatSupabaseErrorDetail(error);
      console.error("[supabase-health] query-failed", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return NextResponse.json(
        { ok: false, env, query: "employees", error: detail },
        { status: 500 },
      );
    }
    console.info("[supabase-health] ok");
    return NextResponse.json({ ok: true, env, query: "employees" });
  } catch (err) {
    const detail = formatSupabaseErrorDetail(err);
    console.error("[supabase-health] exception", detail);
    return NextResponse.json(
      { ok: false, env, query: "employees", error: detail },
      { status: 500 },
    );
  }
}
