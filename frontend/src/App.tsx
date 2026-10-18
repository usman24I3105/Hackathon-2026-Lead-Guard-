import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { useAuth } from "./state/AuthContext";
import Login from "./features/auth/Login";
import Signup from "./features/auth/Signup";
import Relay from "./features/relay/Relay";
import Pipeline from "./features/pipeline/Pipeline";
import ContactsList from "./features/contacts/ContactsList";
import Contact360 from "./features/contacts/Contact360";
import Dashboard from "./features/dashboard/Dashboard";
import Recovery from "./features/recovery/Recovery";
import Audit from "./features/audit/Audit";
import Integrations from "./features/integrations/Integrations";
import Settings from "./features/settings/Settings";
import PublicForm from "./features/publicform/PublicForm";

function RequireAuth({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const location = useLocation();
  if (!session) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/f/:slug" element={<PublicForm />} />

      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/relay" element={<Relay />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/contacts" element={<ContactsList />} />
        <Route path="/contacts/:id" element={<Contact360 />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/recovery" element={<Recovery />} />
        <Route path="/audit" element={<Audit />} />
        <Route path="/integrations" element={<Integrations />} />
        <Route path="/settings" element={<Settings />} />
      </Route>

      <Route path="/" element={<Navigate to="/relay" replace />} />
      <Route path="*" element={<Navigate to="/relay" replace />} />
    </Routes>
  );
}
