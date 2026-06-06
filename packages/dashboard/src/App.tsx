import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth.js";
import { Layout } from "./components/Layout.js";
import { Login } from "./pages/Login.js";
import { Overview } from "./pages/Overview.js";
import { Clients } from "./pages/Clients.js";
import { ClientEdit } from "./pages/ClientEdit.js";
import { Campaigns } from "./pages/Campaigns.js";
import { Conversations } from "./pages/Conversations.js";

export function App() {
  const { session, loading, role, clientId } = useAuth();

  if (loading) {
    return <div className="grid h-full place-items-center text-slate-400">Loading…</div>;
  }

  if (!session) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  // Logged in but not linked to an admin or client record.
  if (!role) {
    return <NotProvisioned />;
  }

  if (role === "client") {
    // Client portal: scoped to their own business. RLS guarantees data isolation.
    if (!clientId) return <NotProvisioned />;
    return (
      <Layout>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/conversations" element={<Conversations />} />
          <Route path="/settings" element={<ClientEdit forcedId={clientId} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    );
  }

  // Admin: full agency access.
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/clients/new" element={<ClientEdit />} />
        <Route path="/clients/:id" element={<ClientEdit />} />
        <Route path="/campaigns" element={<Campaigns />} />
        <Route path="/conversations" element={<Conversations />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

function NotProvisioned() {
  const { session, signOut } = useAuth();
  return (
    <div className="grid h-full place-items-center">
      <div className="max-w-sm rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Account not linked</h1>
        <p className="mt-2 text-sm text-slate-500">
          {session?.user.email} isn't connected to a business yet. Ask your Pulse admin to finish setting up your access.
        </p>
        <button onClick={signOut} className="mt-4 text-sm font-medium text-slate-600 hover:text-slate-900">
          Sign out
        </button>
      </div>
    </div>
  );
}
