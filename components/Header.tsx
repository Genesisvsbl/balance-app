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
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <img
            src={publicPath("/LOGO.png")}
            alt="Bavaria"
            className="h-7 w-24 object-contain"
          />

          <div className="h-7 w-px bg-slate-200" />

          <div>
            <h1 className="text-sm font-black tracking-tight text-slate-950">
              BALANCE
            </h1>
            <p className="text-xs font-semibold text-slate-500">
              Planeación de materiales
            </p>
          </div>
        </div>

        <TopNav active={active} setActive={setActive} />

        <div className="flex items-center gap-2">
          <div className="max-w-[140px] truncate rounded-md border border-[#d4a017]/30 bg-[#fff8df] px-2.5 py-1.5 text-[11px] font-black text-[#9a6a00]">
            {userName}
          </div>

          <button
            onClick={onLogout}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
          >
            Cerrar sesión
          </button>
        </div>
      </div>

      <div className="border-t border-slate-100 bg-[#fbfbfa] px-4 py-2">
        <h2 className="text-base font-black text-slate-950">{title}</h2>
      </div>
    </header>
  );
}
