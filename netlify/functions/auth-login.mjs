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

function htmlMessage(body) {
  const payload = JSON.stringify(body).replace(/</g, "\\u003c");

  return {
    statusCode: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
    body: `<!doctype html><html><body><script>window.parent.postMessage(${payload}, window.location.origin);</script></body></html>`,
  };
}

function response(statusCode, body, asIframe) {
  if (asIframe) {
    return htmlMessage({
      source: "balance-auth",
      ok: statusCode >= 200 && statusCode < 300,
      body,
    });
  }

  return json(statusCode, body);
}

function parseBody(event) {
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : event.body || "";
  const contentType =
    event.headers?.["content-type"] || event.headers?.["Content-Type"] || "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(rawBody));
  }

  return JSON.parse(rawBody || "{}");
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
  let asIframe = false;

  try {
    if (event.httpMethod !== "POST") {
      return json(405, { error: "Method not allowed." });
    }

    const body = parseBody(event);
    asIframe = body.mode === "iframe";
    const { username, password } = body;
    const normalizedUsername = normalizeLogin(username);

    if (!normalizedUsername || !password) {
      return response(400, { error: "Usuario y contrasena son obligatorios." }, asIframe);
    }

    const supabase = createSupabaseClient();
    const { data: users, error } = await supabase
      .from("app_users")
      .select("id, username, full_name, password_salt, password_hash, role, active")
      .eq("active", true);

    if (error) return response(500, { error: error.message }, asIframe);

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
      return response(401, { error: "Usuario o contrasena incorrectos." }, asIframe);
    }

    await supabase
      .from("app_users")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", user.id);

    return response(
      200,
      {
        user: {
          id: user.id,
          username: user.username,
          fullName: user.full_name,
          role: user.role,
        },
      },
      asIframe
    );
  } catch (error) {
    return response(500, { error: error.message || "Unexpected error." }, asIframe);
  }
}
