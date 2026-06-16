"use client";

import { useState } from "react";

type AppUser = {
  id: string;
  username: string;
  fullName: string;
  role: string;
};

type Props = {
  onLogin: (user: AppUser) => void;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const LOGIN_ENDPOINTS = ["/api/auth-login", "/.netlify/functions/auth-login"];
const LOCAL_USERS = [
  {
    id: "0e478af9-deff-48a6-b042-3d205c5a60e6",
    username: "genesis.visbal",
    fullName: "Genesis Visbal",
    role: "admin",
    salt: "6728aa204edebd254c75e1f2a6d05850",
    hash: "31d1e41e125d7d03b76fff0229b632b16e8cd9a9729c29381fa6499baa5f636c",
  },
  {
    id: "b8c4fc6f-916b-40c8-b6df-2cd64170a6c0",
    username: "jeremy.griego",
    fullName: "Jeremy Griego",
    role: "planner",
    salt: "be5ce946c0ad00adcf4a93722bf8970a",
    hash: "cfa57a9b6d80f98ed249e7014777e005b2ef23dc1ed304b264ae02b20ce527c9",
  },
];

function normalizeLogin(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

async function sha256Hex(value: string) {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function loginLocal(username: string, password: string) {
  const normalized = normalizeLogin(username);
  const user = LOCAL_USERS.find((item) => {
    const fullName = normalizeLogin(item.fullName);
    return (
      normalizeLogin(item.username) === normalized ||
      fullName === normalized ||
      fullName.replace(/\s+/g, ".") === normalized
    );
  });

  if (!user) return null;

  const passwordHash = await sha256Hex(`${user.salt}:${password}`);
  if (passwordHash !== user.hash) return null;

  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
  };
}

export default function Login({ onLogin }: Props) {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function acceder() {
    setLoading(true);
    setError("");

    try {
      let lastError = "No se pudo iniciar sesion.";

      if (SUPABASE_URL && SUPABASE_KEY) {
        try {
          const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/login_app_user`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: SUPABASE_KEY,
              Authorization: `Bearer ${SUPABASE_KEY}`,
            },
            body: JSON.stringify({
              login_text: usuario,
              login_password: password,
            }),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(
              data.message ||
                data.error ||
                "Usuario o contrasena incorrectos."
            );
          }

          onLogin(data.user);
          return;
        } catch (error: any) {
          lastError = error.message || "Supabase no respondio.";
        }
      }

      for (const endpoint of LOGIN_ENDPOINTS) {
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              username: usuario,
              password,
            }),
          });

          const contentType = response.headers.get("content-type") || "";

          if (!contentType.includes("application/json")) {
            lastError = `La ruta ${endpoint} devolvio HTML.`;
            continue;
          }

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || "Usuario o contrasena incorrectos.");
          }

          onLogin(data.user);
          return;
        } catch (error: any) {
          lastError = error.message || `No se pudo conectar con ${endpoint}.`;
          continue;
        }
      }

      const localUser = await loginLocal(usuario, password);
      if (localUser) {
        onLogin(localUser);
        return;
      }

      throw new Error(lastError);
    } catch (error: any) {
      setError(error.message || "No se pudo iniciar sesion.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-white text-slate-900">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-white" />

        <div className="absolute left-[-80px] top-[120px] h-[260px] w-[520px] rotate-[-12deg] opacity-[0.08]">
          <div className="h-full w-full bg-[repeating-linear-gradient(0deg,#d4a017_0px,#d4a017_1px,transparent_1px,transparent_18px)]" />
        </div>

        <div className="absolute right-[340px] top-[130px] h-[150px] w-[360px] rotate-[-45deg] opacity-[0.10]">
          <div className="h-full w-full bg-[repeating-linear-gradient(90deg,#d4a017_0px,#d4a017_1px,transparent_1px,transparent_22px)]" />
        </div>

        <div className="absolute bottom-[90px] right-[-40px] h-[220px] w-[480px] rotate-[-12deg] opacity-[0.055]">
          <div className="h-full w-full bg-[repeating-linear-gradient(0deg,#e30613_0px,#e30613_1px,transparent_1px,transparent_18px)]" />
        </div>

        <div className="absolute bottom-[120px] left-[80px] h-[120px] w-[300px] rotate-[-45deg] opacity-[0.07]">
          <div className="h-full w-full bg-[repeating-linear-gradient(90deg,#e30613_0px,#e30613_1px,transparent_1px,transparent_24px)]" />
        </div>

        <div className="absolute bottom-0 left-0 h-[32%] w-full bg-gradient-to-t from-[#f8fafc] to-transparent" />
        <div className="absolute bottom-16 left-12 right-12 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
      </div>

      <header className="relative z-10 flex h-[72px] items-center justify-between border-b border-slate-200 bg-white px-8">
        <div className="flex items-center gap-4">
          <img
            src="/LOGO.png"
            alt="Bavaria"
            className="h-9 object-contain"
          />

          <div className="h-9 w-px bg-slate-200" />

          <div>
            <h1 className="text-xl font-black text-slate-950">BALANCE</h1>
            <p className="text-sm font-semibold text-slate-500">
              Planeacion de materiales
            </p>
          </div>
        </div>

        <span className="rounded-full border border-[#e30613]/25 bg-[#e30613]/5 px-4 py-1.5 text-xs font-bold text-[#e30613]">
          Acceso seguro
        </span>
      </header>

      <section className="relative z-10 flex min-h-[calc(100vh-72px)] items-center justify-end px-14">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(0,0,0,0.10)]">
          <div className="flex flex-col items-center border-b border-slate-100 px-6 py-6 text-center">
            <img
              src="/LOGO.png"
              alt="Bavaria"
              className="h-12 object-contain"
            />

            <h2 className="mt-4 text-2xl font-black text-slate-950">
              Iniciar sesion
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Acceda al sistema de planeacion
            </p>
          </div>

          <div className="px-6 py-6">
            <label className="text-xs font-bold uppercase text-slate-500">
              Usuario
            </label>

            <input
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#e30613] focus:ring-2 focus:ring-[#e30613]/10"
              placeholder="Ingrese su usuario"
            />

            <label className="mt-4 block text-xs font-bold uppercase text-slate-500">
              Contrasena
            </label>

            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#e30613] focus:ring-2 focus:ring-[#e30613]/10"
              placeholder="Ingrese su contrasena"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !loading) acceder();
              }}
            />

            {error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-[#e30613]">
                {error}
              </div>
            )}

            <button
              onClick={acceder}
              disabled={loading}
              className="mt-5 w-full rounded-lg bg-[#e30613] py-3 text-sm font-bold text-white shadow-md transition hover:bg-[#b8000f] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "VALIDANDO..." : "ACCEDER"}
            </button>
          </div>

          <div className="border-t border-slate-100 bg-slate-50 px-6 py-3 text-center text-xs font-medium text-slate-400">
            BALANCE (c) 2026
          </div>
        </div>
      </section>

      <footer className="absolute bottom-5 left-0 right-0 text-center text-xs text-slate-400">
        Version 1.0.0 - Sistema profesional de planeacion de materiales
      </footer>
    </main>
  );
}
