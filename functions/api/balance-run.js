import { json, supabaseRequest } from "../_shared/supabase-rest.js";

export async function onRequestDelete(context) {
  try {
    const { request, env } = context;
    const id = new URL(request.url).searchParams.get("id");

    if (!id) {
      return json(400, { error: "Missing balance id." });
    }

    await supabaseRequest(env, `/balance_runs?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: {
        Prefer: "return=minimal",
      },
    });

    await supabaseRequest(env, "/audit_events", {
      method: "POST",
      headers: {
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        action: "BALANCE_DELETED",
        entity: "balance_run",
        entity_id: id,
        details: {},
      }),
    });

    return json(200, { ok: true });
  } catch (error) {
    return json(500, { error: error.message || "Unexpected error." });
  }
}
