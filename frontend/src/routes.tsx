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
import LeadDirectory from "./features/relay/LeadDirectory";
import { Companies, CompanyDetail } from "./features/contacts/Companies";
import Opportunities from "./features/pipeline/Opportunities";
import Inbox from "./features/contacts/Inbox";
import Payments from "./features/contacts/Payments";
import Appointments from "./features/contacts/Appointments";
import TeamWorkspace from "./features/settings/TeamWorkspace";
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
        <Route
          path="/relay"
          element={
            <RequirePermission permission="leads.view">
              <Relay />
            </RequirePermission>
          }
        />
        <Route
          path="/leads"
          element={
            <RequirePermission permission="leads.view">
              <LeadDirectory />
            </RequirePermission>
          }
        />
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
          path="/companies"
          element={
            <RequirePermission permission="contacts.view">
              <Companies />
            </RequirePermission>
          }
        />
        <Route
          path="/companies/:id"
          element={
            <RequirePermission permission="contacts.view">
              <CompanyDetail />
            </RequirePermission>
          }
        />
        <Route
          path="/opportunities"
          element={
            <RequirePermission permission="pipeline.manage">
              <Opportunities />
            </RequirePermission>
          }
        />
        <Route
          path="/conversations"
          element={
            <RequirePermission permission="contacts.view">
              <Inbox />
            </RequirePermission>
          }
        />
        <Route
          path="/appointments"
          element={
            <RequirePermission permission="contacts.view">
              <Appointments />
            </RequirePermission>
          }
        />
        <Route
          path="/payments"
          element={
            <RequirePermission permission="contacts.view">
              <Payments />
            </RequirePermission>
          }
        />
        <Route
          path="/team"
          element={
            <RequirePermission permission="leads.view">
              <TeamWorkspace />
            </RequirePermission>
          }
        />
        <Route
          path="/dashboard"
          element={
            <RequirePermission permission="dashboard.full">
              <Dashboard />
            </RequirePermission>
          }
        />
        <Route
          path="/recovery"
          element={
            <RequirePermission permission="leads.view">
              <Recovery />
            </RequirePermission>
          }
        />
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
