import { createClient } from "@supabase/supabase-js";

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error("Supabase environment variables are not configured.");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
    },
  });
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

    const supabase = client();
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
