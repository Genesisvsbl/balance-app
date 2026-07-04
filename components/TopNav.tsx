"use client";

type Props = {
  active: string;
  setActive: (value: string) => void;
};

const modules = [
  { id: "importacion", label: "Bases" },
  { id: "balance", label: "Balance" },
  { id: "balance2", label: "Balance 2" },
  { id: "dashboard", label: "Dashboard" },
  { id: "variacion", label: "Variaciones" },
  { id: "historico", label: "HistÃ³rico" },
];

export default function TopNav({ active, setActive }: Props) {
  return (
    <div className="flex items-center gap-2">
      {modules.map((m) => (
        <button
          key={m.id}
          onClick={() => setActive(m.id)}
          className={`rounded-md px-2 py-1.5 text-[11px] font-black transition ${
            active === m.id
              ? "bg-white text-[#003B7A] shadow-sm"
              : "text-blue-100 hover:bg-white/10 hover:text-white"
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

