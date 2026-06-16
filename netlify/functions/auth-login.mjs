import crypto from "node:crypto";
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

function hashPassword(salt, password) {
  return crypto.createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { error: "Method not allowed." });
    }

    const { username, password } = JSON.parse(event.body || "{}");
    const normalizedUsername = String(username || "").trim().toLowerCase();

    if (!normalizedUsername || !password) {
      return json(400, { error: "Usuario y contraseña son obligatorios." });
    }

    const supabase = client();
    const { data: user, error } = await supabase
      .from("app_users")
      .select("id, username, full_name, password_salt, password_hash, role, active")
      .eq("username", normalizedUsername)
      .maybeSingle();

    if (error) return json(500, { error: error.message });

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
