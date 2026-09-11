import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/guard";
import { hasSupabaseServiceRole } from "@/lib/supabase/server";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  return NextResponse.json({
    user: {
      employeeId: session.employeeId,
      nom: session.nom,
      isAdmin: session.isAdmin,
    },
    hasServiceRole: hasSupabaseServiceRole(),
  });
}
