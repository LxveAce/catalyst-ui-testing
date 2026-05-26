# Fresh-VM install test

How to validate a release installer behaves correctly on a Windows
machine that has NEVER had Node, npm, or Claude Code installed. This
is the canonical end-user-on-a-fresh-PC scenario — what someone
downloading from the release page actually experiences.

## Why bother

Local builds always succeed because the dev box has Node, the Claude
CLI, git, possibly stale `%AppData%` data, etc. A real new user has
none of that. The only way to catch missing-prereq bugs is to install
into a known-clean environment.

## Setup the VM

### Option A — Windows Sandbox (fastest, free)

If your host runs Windows 10/11 Pro, Enterprise, or Education:

1. Enable Windows Sandbox once (Settings → Apps → Optional Features →
   Add a Feature → Windows Sandbox).
2. Launch **Windows Sandbox** from the Start menu. You get a clean
   throw-away Windows desktop in ~10 seconds.
3. Drop the installer .exe into the sandbox window (drag-and-drop).
4. Sandbox state is wiped when closed — nothing persists. Perfect for
   one-off install validation.

Limitation: Sandbox doesn't have internet via host VPN, can't easily
share files persistently, and runs Windows 11 Pro (so the test
environment is always a Pro SKU).

### Option B — VirtualBox / VMware / Hyper-V

For a real persistent VM:

1. Install VirtualBox (https://www.virtualbox.org/) or use Hyper-V
   (already on Windows Pro+).
2. Get a Windows 11 ISO from Microsoft
   (https://www.microsoft.com/software-download/windows11).
3. Create a VM with 8 GB RAM, 60 GB disk, internet bridged.
4. Install Windows. **Do not** sign in to a Microsoft account — pick
   "limited setup" so the user account is local-only (matches what most
   non-MSA users have).
5. Take a snapshot after the first boot — revert here to repeat the
   test cleanly.

## What to test

### Pre-install state

In the VM, BEFORE installing:

```powershell
node --version             # should error: not recognized
npm --version              # should error
claude --version           # should error
where claude               # should error
Get-Item "$env:LOCALAPPDATA\Programs\Claude Code Studio" -ErrorAction SilentlyContinue
Get-Item "$env:APPDATA\Claude Code Studio" -ErrorAction SilentlyContinue
# Both should return nothing
```

Confirms the VM is truly fresh.

### Install

1. Download `Claude-Code-Studio-2.0.0-Windows.exe` from the GitHub
   release page in the VM's browser.
2. Run it. Note the SmartScreen warning if/when it appears.
3. The NSIS bootstrap should show progress for: downloading Node,
   verifying SHA256, extracting, installing Claude CLI.
4. App should auto-launch when bootstrap completes.

### Post-install verification

After the app launches, verify each item:

| Check | How to verify | Pass criterion |
|---|---|---|
| App window opens | Visual | Main window with title bar + terminal pane visible |
| Embedded terminal spawns `claude` | Click into terminal | Claude greeting appears |
| Onboarding modal shows | Look for modal | "Welcome to Claude Code Studio" overlay appears |
| Sign In button works | Click "Sign in to Claude" in modal | Terminal panel switches active + `claude login` types AND submits |
| Browser opens for OAuth | After clicking sign-in | Default browser opens to Anthropic OAuth page |
| Auth completes | Finish OAuth in browser | Terminal shows authenticated state |
| Resource monitor populates | Open Resources panel | CPU/RAM gauges show values, not "—" |
| Settings persist | Change theme, close + reopen app | New theme applied on relaunch |
| Compact controller | Open Compact panel | Either shows current state OR "not enabled" — no crash |

### Uninstall verification

1. Apps & Features → Claude Code Studio → Uninstall.
2. Confirm:
   - `%LocalAppData%\Programs\Claude Code Studio\` is gone
   - Start Menu shortcut is gone
   - **Survives:** `%AppData%\Claude Code Studio\` (user data — intentional)
3. Reinstall to confirm user-data survives the round trip.

## What to do if a test fails

The installer's failure modals embed the actual stderr from each step
(curl exit code, npm error, etc.). Screenshot the modal, plus check
`%TEMP%\ccs-install.log` for the per-step trace. File issues with
both attached.

For app-crash-after-install (e.g. main-process JS error), the error
dialog quotes the file + line. Save the dialog text; it's usually
enough to pin down the failing module.

## Known caveats per release

- v2.0.0 first install on Windows: SmartScreen warning "Unknown
  Publisher" — click More info → Run anyway. Will be fixed once
  code-signing cert is in place (tracked v2.1).
- Bootstrap requires internet (~30 MB Node + ~30 MB CLI). On flaky
  WiFi / corporate proxy, the download can timeout — the modal
  surfaces the exact curl error.

## Quick smoke test (5 minutes)

For when you just want a confidence check, not a full validation:

1. Boot the VM snapshot.
2. Download + run the installer.
3. Wait for app launch.
4. Look at the terminal — if `claude` is running and responsive,
   ship it. Otherwise capture screenshots and dig in.
