"use client";

type Props = {
  active: string;
  setActive: (value: string) => void;
};

const modules = [
  { id: "dashboard", label: "Dashboard" },
  { id: "importacion", label: "Importación / Bases" },
  { id: "balance", label: "Balance de materiales" },
  { id: "historico", label: "Histórico" },
];

export default function Sidebar({ active, setActive }: Props) {
  return (
    <aside className="min-h-screen w-72 bg-[#071b33] text-white">
      <div className="border-b border-white/10 p-6">
        <div className="flex items-center gap-3">
          <img src="/LOGO.png" alt="Logo" className="h-12 w-12 object-contain" />
          <div>
            <h1 className="text-lg font-black">BALANCE ERP</h1>
            <p className="text-xs text-blue-200">Material Planning</p>
          </div>
        </div>
      </div>

      <nav className="space-y-2 p-4">
        {modules.map((m) => (
          <button
            key={m.id}
            onClick={() => setActive(m.id)}
            className={`w-full rounded-xl px-4 py-3 text-left text-sm font-bold transition ${
              active === m.id
                ? "bg-blue-600 text-white shadow"
                : "text-blue-100 hover:bg-white/10"
            }`}
          >
            {m.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}