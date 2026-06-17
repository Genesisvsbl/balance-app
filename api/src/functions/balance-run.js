import { app } from "@azure/functions";
import { createSupabaseClient } from "../supabase-client.js";

function response(status, body) {
  return {
    status,
    jsonBody: body,
    headers: {
      "content-type": "application/json",
    },
  };
}

app.http("balance-run", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  handler: async (request) => {
    try {
      const id = request.query.get("id");
      if (!id) {
        return response(400, { error: "Missing balance id." });
      }

      const supabase = createSupabaseClient();
      const { error } = await supabase.from("balance_runs").delete().eq("id", id);

      if (error) {
        return response(500, { error: error.message });
      }

      await supabase.from("audit_events").insert({
        action: "BALANCE_DELETED",
        entity: "balance_run",
        entity_id: id,
        details: {},
      });

      return response(200, { ok: true });
    } catch (error) {
      return response(500, { error: error.message || "Unexpected error." });
    }
  },
});
