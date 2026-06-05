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
  const { session, loading } = useAuth();

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
