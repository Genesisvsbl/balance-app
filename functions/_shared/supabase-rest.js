function getSupabaseConfig(env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error("Supabase environment variables are not configured.");
  }

  return {
    baseUrl: `${url.replace(/\/$/, "")}/rest/v1`,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
  };
}

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

export async function supabaseRequest(env, path, options = {}) {
  const { baseUrl, headers } = getSupabaseConfig(env);
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = data?.message || data?.error || response.statusText;
    throw new Error(message);
  }

  return data;
}

export function normalizeLogin(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export async function hashPassword(salt, password) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function encodeFilterValue(value) {
  return encodeURIComponent(String(value));
}
