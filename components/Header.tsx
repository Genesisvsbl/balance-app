"use client";

import TopNav from "./TopNav";
import { publicPath } from "@/lib/site";

type Props = {
  title: string;
  active: string;
  setActive: (value: string) => void;
  onLogout: () => void;
  userName: string;
};

export default function Header({
  title,
  active,
  setActive,
  onLogout,
  userName,
}: Props) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#003B7A] bg-[#0057B8] text-white shadow-sm">
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <img
            src={publicPath("/LOGO_WHITE.png")}
            alt="Bavaria"
            className="h-7 w-24 object-contain"
          />

          <div className="h-7 w-px bg-white/25" />

          <div>
            <h1 className="text-sm font-black tracking-tight text-white">
              BALANCE
            </h1>
            <p className="text-xs font-semibold text-blue-100">
              Planeación de materiales
            </p>
          </div>
        </div>

        <TopNav active={active} setActive={setActive} />

        <div className="flex items-center gap-2">
          <button
            onClick={() => window.location.reload()}
            title="Actualizar (recarga para ver los ultimos cambios)"
            aria-label="Actualizar"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-white/25 bg-white/10 text-white transition hover:bg-white/20"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <polyline points="21 3 21 9 15 9" />
            </svg>
          </button>

          <div className="max-w-[140px] truncate rounded-md border border-white/20 bg-white/10 px-2.5 py-1.5 text-[11px] font-black text-white">
            {userName}
          </div>

          <button
            onClick={onLogout}
            className="rounded-md border border-white/25 bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#003B7A] hover:bg-blue-50"
          >
            Cerrar sesión
          </button>
        </div>
      </div>

      <div className="border-t border-white/15 bg-[#003B7A] px-4 py-2">
        <h2 className="text-base font-black text-white">{title}</h2>
      </div>
    </header>
  );
}
