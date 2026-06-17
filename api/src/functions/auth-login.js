import crypto from "node:crypto";
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

function hashPassword(salt, password) {
  return crypto.createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

function normalizeLogin(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

app.http("auth-login", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request) => {
    try {
      const { username, password } = await request.json().catch(() => ({}));
      const normalizedUsername = normalizeLogin(username);

      if (!normalizedUsername || !password) {
        return response(400, { error: "Usuario y contraseña son obligatorios." });
      }

      const supabase = createSupabaseClient();
      const { data: users, error } = await supabase
        .from("app_users")
        .select("id, username, full_name, password_salt, password_hash, role, active")
        .eq("active", true);

      if (error) return response(500, { error: error.message });

      const user = (users || []).find((item) => {
        const usernameMatch = normalizeLogin(item.username) === normalizedUsername;
        const fullNameMatch = normalizeLogin(item.full_name) === normalizedUsername;
        const compactFullNameMatch =
          normalizeLogin(item.full_name).replace(/\s+/g, ".") === normalizedUsername;

        return usernameMatch || fullNameMatch || compactFullNameMatch;
      });

      const valid =
        user?.active &&
        hashPassword(user.password_salt, String(password)) === user.password_hash;

      await supabase.from("audit_events").insert({
        user_id: user?.id || null,
        username: normalizedUsername,
        action: valid ? "LOGIN_SUCCESS" : "LOGIN_FAILED",
        entity: "session",
        entity_id: user?.id || null,
        details: {
          userAgent: request.headers.get("user-agent") || "",
        },
      });

      if (!valid) {
        return response(401, { error: "Usuario o contraseña incorrectos." });
      }

      await supabase
        .from("app_users")
        .update({ last_login_at: new Date().toISOString() })
        .eq("id", user.id);

      return response(200, {
        user: {
          id: user.id,
          username: user.username,
          fullName: user.full_name,
          role: user.role,
        },
      });
    } catch (error) {
      return response(500, { error: error.message || "Unexpected error." });
    }
  },
});
