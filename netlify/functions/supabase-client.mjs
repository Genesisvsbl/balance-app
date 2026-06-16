import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

export function createSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error("Supabase environment variables are not configured.");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
    },
    realtime: {
      transport: WebSocket,
    },
  });
}
