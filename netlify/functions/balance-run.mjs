import { createSupabaseClient } from "./supabase-client.mjs";

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

export async function handler(event) {
  try {
    if (event.httpMethod !== "DELETE") {
      return json(405, { error: "Method not allowed." });
    }

    const id = event.queryStringParameters?.id;
    if (!id) {
      return json(400, { error: "Missing balance id." });
    }

    const supabase = createSupabaseClient();
    const { error } = await supabase
      .from("balance_runs")
      .delete()
      .eq("id", id);

    if (error) {
      return json(500, { error: error.message });
    }

    await supabase.from("audit_events").insert({
      action: "BALANCE_DELETED",
      entity: "balance_run",
      entity_id: id,
      details: {},
    });

    return json(200, { ok: true });
  } catch (error) {
    return json(500, { error: error.message || "Unexpected error." });
  }
}
