import { hashPassword, json, normalizeLogin, supabaseRequest } from "../_shared/supabase-rest.js";

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const { username, password } = await request.json().catch(() => ({}));
    const normalizedUsername = normalizeLogin(username);

    if (!normalizedUsername || !password) {
      return json(400, { error: "Usuario y contraseña son obligatorios." });
    }

    const users = await supabaseRequest(
      env,
      "/app_users?active=eq.true&select=id,username,full_name,password_salt,password_hash,role,active"
    );

    const user = (users || []).find((item) => {
      const usernameMatch = normalizeLogin(item.username) === normalizedUsername;
      const fullNameMatch = normalizeLogin(item.full_name) === normalizedUsername;
      const compactFullNameMatch =
        normalizeLogin(item.full_name).replace(/\s+/g, ".") === normalizedUsername;

      return usernameMatch || fullNameMatch || compactFullNameMatch;
    });

    const valid =
      user?.active &&
      (await hashPassword(user.password_salt, String(password))) === user.password_hash;

    await supabaseRequest(env, "/audit_events", {
      method: "POST",
      headers: {
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        user_id: user?.id || null,
        username: normalizedUsername,
        action: valid ? "LOGIN_SUCCESS" : "LOGIN_FAILED",
        entity: "session",
        entity_id: user?.id || null,
        details: {
          userAgent: request.headers.get("user-agent") || "",
        },
      }),
    });

    if (!valid) {
      return json(401, { error: "Usuario o contraseña incorrectos." });
    }

    await supabaseRequest(env, `/app_users?id=eq.${encodeURIComponent(user.id)}`, {
      method: "PATCH",
      headers: {
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ last_login_at: new Date().toISOString() }),
    });

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
