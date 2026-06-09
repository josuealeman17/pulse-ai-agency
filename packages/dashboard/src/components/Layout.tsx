import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../lib/auth.js";

const adminNav = [
  { to: "/", label: "Overview", end: true },
  { to: "/clients", label: "Clients", end: false },
  { to: "/campaigns", label: "Review Campaigns", end: false },
  { to: "/reputation", label: "Reputation", end: false },
  { to: "/conversations", label: "Conversations", end: false },
];

const clientNav = [
  { to: "/", label: "Overview", end: true },
  { to: "/reputation", label: "Reputation", end: false },
  { to: "/conversations", label: "Conversations", end: false },
  { to: "/settings", label: "My Settings", end: false },
];

export function Layout({ children }: { children: ReactNode }) {
  const { session, signOut, role } = useAuth();
  const nav = role === "client" ? clientNav : adminNav;

  return (
    <div className="flex h-full">
      <aside className="flex w-60 flex-col bg-slate-900 text-slate-300">
        <div className="flex items-center gap-2 px-5 py-5 text-white">
          <span className="text-lg">⚡</span>
          <span className="font-semibold tracking-tight">Pulse</span>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm font-medium transition ${
                  isActive ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-800 px-5 py-4 text-xs">
          <div className="truncate text-slate-400">{session?.user.email}</div>
          <button onClick={signOut} className="mt-1 text-slate-500 hover:text-white">
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
