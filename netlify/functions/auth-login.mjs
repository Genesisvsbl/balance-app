import crypto from "node:crypto";
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

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { error: "Method not allowed." });
    }

    const { username, password } = JSON.parse(event.body || "{}");
    const normalizedUsername = normalizeLogin(username);

    if (!normalizedUsername || !password) {
      return json(400, { error: "Usuario y contraseña son obligatorios." });
    }

    const supabase = createSupabaseClient();
    const { data: users, error } = await supabase
      .from("app_users")
      .select("id, username, full_name, password_salt, password_hash, role, active")
      .eq("active", true);

    if (error) return json(500, { error: error.message });

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
        userAgent: event.headers["user-agent"] || "",
      },
    });

    if (!valid) {
      return json(401, { error: "Usuario o contraseña incorrectos." });
    }

    await supabase
      .from("app_users")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", user.id);

    return json(200, {
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        role: user.role,
      },
    });
  } catch (error) {
    return json(500, { error: error.message || "Unexpected error." });
  }
}
