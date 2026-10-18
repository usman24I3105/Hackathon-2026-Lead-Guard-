import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "./Primitives";
import { Icon } from "./icons";

export function PermissionDenied({ permission }: { permission: string }) {
  const [copied, setCopied] = useState(false);
  async function copyPermission() {
    try {
      await navigator.clipboard.writeText(permission);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="permission-empty-state" aria-labelledby="permission-title">
      <span className="permission-icon"><Icon name="lock" size={24} /></span>
      <h1 id="permission-title">You don’t have access to this page</h1>
      <p className="permission-copy">This page requires <code>{permission}</code>.</p>
      <p className="permission-helper">Ask a workspace owner or manager to grant it.</p>
      <div className="permission-actions">
        <Link to="/relay" className="ui-button ui-button--primary ui-button--lg"><span className="ui-button-content">Go to Live relay</span></Link>
        <Button variant="secondary" leadingIcon={<Icon name="copy" size={15} />} onClick={copyPermission}>{copied ? "Copied" : "Copy permission name"}</Button>
      </div>
    </section>
  );
}
