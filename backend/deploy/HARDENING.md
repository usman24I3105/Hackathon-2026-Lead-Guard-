# LeadGuard Production VPS Hardening Guide (SEC-8)

This guide details the security baseline applied to production servers running the LeadGuard monolith.

## 1. Operating System & SSH
- **Disable Root & Password Logins**: Copy `deploy/sshd_config.d/leadguard.conf` to `/etc/ssh/sshd_config.d/leadguard.conf`. Ensure `PermitRootLogin no` and `PasswordAuthentication no`.
- **Fail2ban**: Install `fail2ban` and enable jails with `deploy/fail2ban/leadguard.conf`.
- **Firewall (UFW)**:
  ```bash
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow 22/tcp   # SSH
  ufw allow 80/tcp   # HTTP
  ufw allow 443/tcp  # HTTPS
  ufw enable
  ```
- **Automatic Security Updates**:
  ```bash
  apt-get install unattended-upgrades
  dpkg-reconfigure --priority=low unattended-upgrades
  ```

## 2. PostgreSQL Role Isolation & Hardening
- **Localhost only**: Set `listen_addresses = 'localhost'` in `postgresql.conf`. Port 5432 is never exposed externally.
- **SCRAM-SHA-256**: Replace `/etc/postgresql/16/main/pg_hba.conf` lines with `deploy/pg_hba.snippet`.
- **Role separation**:
  - `lg_migrator`: DDL ownership, schema migrations, operator seeds only.
  - `lg_app`: Web runtime pool, RLS strictly enforced (`FORCE ROW LEVEL SECURITY`), `statement_timeout = '5s'`.
  - `lg_worker`: Internal escalation sweeper & outbox, `BYPASSRLS`.

## 3. Systemd Sandboxing
- Copy `deploy/leadguard.service` to `/etc/systemd/system/leadguard.service`.
- Run verification command:
  ```bash
  systemd-analyze security leadguard
  ```
  Ensure score is low exposure (all modern namespaces, read-only system, and capabilities dropped).

## 4. File Permissions & Environment Secrets
- `.env` must be owned by the service user and strictly permissioned:
  ```bash
  chown leadguard:leadguard /opt/leadguard/backend/.env
  chmod 600 /opt/leadguard/backend/.env
  ```

## 5. Encrypted Backups & Verification
- Backups are performed via `deploy/backup.sh` (AES-256-CBC with PBKDF2 encryption, 7-day retention).
- Verify backup integrity regularly with `deploy/restore-check.sh` which restores to a scratch database and compares row counts.
