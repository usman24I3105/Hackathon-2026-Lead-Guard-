import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { RequireAuth } from "./components/RequireAuth";
import { RequirePermission } from "./components/RequirePermission";
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

export function AppRoutes() {
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
        <Route
          path="/pipeline"
          element={
            <RequirePermission permission="pipeline.manage">
              <Pipeline />
            </RequirePermission>
          }
        />
        <Route path="/contacts" element={<ContactsList />} />
        <Route path="/contacts/:id" element={<Contact360 />} />
        <Route
          path="/dashboard"
          element={
            <RequirePermission permission="dashboard.full">
              <Dashboard />
            </RequirePermission>
          }
        />
        <Route path="/recovery" element={<Recovery />} />
        <Route
          path="/audit"
          element={
            <RequirePermission permission="audit.view">
              <Audit />
            </RequirePermission>
          }
        />
        <Route
          path="/integrations"
          element={
            <RequirePermission permission="integrations.manage">
              <Integrations />
            </RequirePermission>
          }
        />
        {/* Settings mixes workspace-wide config with personal settings (notifications,
            password) that every signed-in user needs — gated per-tab inside the page
            instead of at the route. */}
        <Route path="/settings" element={<Settings />} />
      </Route>

      <Route path="/" element={<Navigate to="/relay" replace />} />
      <Route path="*" element={<Navigate to="/relay" replace />} />
    </Routes>
  );
}
