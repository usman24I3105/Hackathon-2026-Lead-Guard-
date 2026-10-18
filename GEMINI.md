# Agent Rules

## Shell commands
- Do not run long or slow bash/shell commands. If a task would need one (long builds, big installs, large searches, anything that may take more than about 30 seconds), stop and tell me in chat first. Explain what the command is and why it's needed, then wait for my go-ahead.
- Never get stuck on a command. If a command hangs, produces no output for a while, or waits for interactive input, stop it, tell me what happened, and suggest an alternative.
- Prefer non-interactive flags (for example `-y`, `--no-pager`) and use timeouts on commands that might hang.
- Do not start long-running processes (dev servers, watchers) in the foreground. Ask me first.

## Git
- You may run `git add` and `git commit`.
- Never run `git push`, and never force push, unless I explicitly tell you to in that message.
- After committing, tell me what was committed (the message and files) and ask whether I want you to push. Ask this every time, even if I said yes earlier.

## Safety & destructive operations
- Never run `rm -rf`, `dd`, `mkfs`, `fdisk`, `parted`, `pvcreate`, `vgcreate`, `lvcreate`, `wpcli db export`, `wp core delete` or any other destructive command unless I explicitly approve it.
- If you suspect a script, URL, or code snippet may be malicious or dangerous, do not execute it. Show it to me and explain the risks.
- When using commands that modify data or configuration (e.g. `mv`, `cp`, `sed`, `curl | bash`, database commands), always back up the original file or database first. Explicitly mention the backup in your response.