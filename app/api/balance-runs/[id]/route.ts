import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const supabaseServer = createSupabaseServerClient();
  const { id } = await context.params;

  const { error } = await supabaseServer
    .from("balance_runs")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
