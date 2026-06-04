# Wcarck Plan Review — v0.1.4 + Competitor Analysis v1.2

**Reviewer:** Antigravity AI  
**Documents reviewed:**
- [Wcarck.md](file:///c:/Users/Parikshit/Desktop/NewGenApps/Wcrack/Wcarck.md) — v0.1.4 (2239 lines)
- [Wcarck_competitor_analysis.md](file:///c:/Users/Parikshit/Desktop/NewGenApps/Wcrack/Wcarck_competitor_analysis.md) — v1.2 (706 lines)

---

## Overall Verdict

The plan is **exceptionally thorough** for a solo pre-implementation document. The architecture is sound, the competitor synthesis is honest and specific, and the MVP trim in v0.1.4 was the right call. The documents are ready to drive a Phase 1 implementation start.

The gaps below are **not blocking**, but addressing them before `v0.2.0` (repo scaffold) will save debugging time during Phases 2–4.

---

## 1. Strengths (what is working very well)

| Area | What the plan gets right |
|---|---|
| Architecture layering | Control-plane / data-plane / system-plane split is clean and prevents the "one big god-object" pattern |
| RadioLeaseManager | Making adapters first-class leased resources is the single biggest robustness win over all four reference tools |
| ManagedProcess cascade | Explicit SIGINT → SIGTERM → kill with `__del__` safety net closes the #1 source of zombie-process bugs |
| Module/Param/Handler triad | Inherited correctly from bettercap; gives a uniform shape for REST, CLI, plugins, and events |
| MVP trim | Dropping reports/evidence-registry/legal from MVP was correct; the RF core must prove itself first |
| DB schema | `resource_leases`, `job_queue`, `job_events`, `crack_jobs` are all well thought out |
| Competitor attribution | File-by-file upstream mapping with line numbers is exemplary GPL compliance |
| Anti-patterns list | Section 6 of the competitor analysis (10 items) is a high-value checklist every contributor should read |
| hwsim testing | Using `mac80211_hwsim` as the CI radio substrate is the right approach — eliminates RF in CI |

---

## 2. Gaps & Improvements

### 2.1 Architecture — Missing `ReportModule` in Phase 1 schema

The built-in module priority list (Section 26.7) includes `ReportModule` at position 10, but:
- There is **no `ReportModule` anywhere in the project structure** (Section 8) or the module list (Section 26.2).
- It is not mentioned in any Phase deliverable until Phase 5.

**Fix:** Either remove `ReportModule` from the 26.7 priority list for now (it belongs in Phase 5), or add a stub entry in Section 26.2. Do not leave an undeclared module in a priority-ordered list.

---

### 2.2 Architecture — `captures` table missing `sha256` column

The plan states (Section 12, D30): *"artifact paths + SHA-256 ship in MVP."*  
But the `captures` table in Section 9 has no `sha256` column. The `artifact_writer` referenced in Section 26.6 has no schema backing.

**Fix:** Add `sha256 TEXT` to the `captures` table and to `ap_sessions` (for portal log artifacts). Also add a lightweight `artifacts` table that the `artifact_writer` writes to, even if the full evidence registry waits for Phase 5:

```sql
CREATE TABLE artifacts (
    id          INTEGER PRIMARY KEY,
    job_id      INTEGER REFERENCES job_queue(id),
    scope_id    INTEGER NOT NULL REFERENCES scopes(id),
    type        TEXT NOT NULL,       -- capture.pcapng | capture.22000 | portal.credential_validated | scan.snapshot | tool.log
    path        TEXT NOT NULL,
    sha256      TEXT NOT NULL,
    size_bytes  INTEGER,
    created_at  TIMESTAMP NOT NULL
);
```

This is the minimum to make `D30` true at MVP — without it, "SHA-256 stored" is aspirational.

---

### 2.3 Architecture — `attack_sessions` table is partially redundant with `job_queue`

`attack_sessions` has its own `status`, `started_at`, `ended_at`, `error_msg`, and `adapter_id`. But `job_queue` already owns these for every job. Two sources of truth for the same state machine will diverge.

**Fix:** Make `attack_sessions` a narrow extension table that adds attack-specific columns (`type`, `target_bssid`, `target_client`, `channel`, `packets_sent`) and references `job_queue(id)` as a FK. Drop the redundant `status`/`started_at`/`ended_at`/`error_msg` from `attack_sessions` — inherit them from `job_queue`.

```sql
CREATE TABLE attack_sessions (
    id              INTEGER PRIMARY KEY,
    job_id          INTEGER NOT NULL REFERENCES job_queue(id),  -- lifecycle owned by job_queue
    type            TEXT NOT NULL,
    target_bssid    TEXT,
    target_client   TEXT,
    channel         INTEGER,
    packets_sent    INTEGER NOT NULL DEFAULT 0,
    scope_id        INTEGER NOT NULL REFERENCES scopes(id),
    adapter_id      INTEGER NOT NULL REFERENCES adapters(id)
    -- no status/started_at/ended_at: use job_queue
);
```

---

### 2.4 Security — Credential encryption scheme is underspecified

Section 12 says credentials are *"encrypted at rest"* and *"viewing requires the operator passphrase"*, but:
- **No encryption algorithm is specified** for `credentials.password_encrypted` (BLOB).
- Is this AES-256-GCM with a passphrase-derived key? Fernet? nacl.SecretBox?
- Is the operator passphrase stored anywhere (even temporarily in memory)?
- What happens to the key if the operator's session expires mid-session?

**Fix:** Add a sub-section in Section 12 that specifies:
1. Algorithm: **AES-256-GCM** (via Python `cryptography` library)
2. KDF: **Argon2id** with a random 16-byte salt stored alongside each row
3. Key lifetime: derived per-request, not cached
4. `credentials` table: add `kdf_salt BLOB NOT NULL` column

This prevents a future implementation from accidentally using a weaker scheme.

---

### 2.5 Security — `CAP_SYS_ADMIN` is too broad

The systemd unit (Section 14) grants `CAP_SYS_ADMIN`. This is the "do anything" capability on Linux — it includes mounting filesystems, modifying namespaces, loading kernel modules, and more.

The plan comment says *"some nl80211 paths"* but the actual nl80211 operations (monitor mode, channel set) need only `CAP_NET_ADMIN`. `CAP_SYS_ADMIN` is only needed for `mac80211_hwsim` in CI, not in production.

**Fix:**
- Remove `CAP_SYS_ADMIN` from the production systemd unit.
- Add a comment: *"mac80211_hwsim (CI only) requires CAP_SYS_ADMIN; dev.service override adds it."*
- Use `systemd-analyze security wcarck.service` during Phase 1 to validate the score.

---

### 2.6 Security — Plugin subprocess import is fragile

Section 26.3 says plugins are *"imported in a sandboxed subprocess (no global state leak)"* but later says *"plugins run in-process, no OS-level sandbox."* These contradict each other.

**Clarification needed:** The subprocess import is just for the initial registration/validation step (importing the module to check it exposes `register()`). After that, the module runs in-process. This needs to be stated explicitly or the two sections will confuse implementers.

**Fix:** Rewrite Section 26.3 step 1 as:
> *"At registration time, the loader imports the plugin module in a child subprocess to validate it exposes `register(registry) -> None` without executing side effects in the main process. After validation, the module file is imported into the main process and runs in-process with full service privileges."*

---

### 2.7 RF Operations — `wlan_ap` 5 GHz monitor mode and Evil Twin are mutually exclusive but not modeled

The radio role table (Section 4) says `wlan_ap` is "Evil Twin AP + 5 GHz monitor". But when `wlan_ap` is in AP mode (hosting Evil Twin), it **cannot simultaneously monitor 5 GHz channels**.

The RadioLeaseManager lease table (Section 6) covers this with `ap.service` conflicting with monitor jobs, but the **user-facing implication is undocumented**:
- If the Evil Twin is running on 5 GHz (via `wlan_ap`), there is **no 5 GHz monitor capability** during that session.
- The only active monitor card during Evil Twin is `wlan_mon` (2.4 GHz Ralink).
- 5 GHz Evil Twins against `NASA+` (ch 157) require giving up all 5 GHz monitoring.

**Fix:** Add a note in Section 4 and Section 11 Phase 4:
> *"When wlan_ap is in AP mode for Evil Twin, 5 GHz passive monitoring is unavailable. The UI must reflect this constraint (gray out 5 GHz scan while Evil Twin is running on wlan_ap)."*

---

### 2.8 RF Operations — `hcxdumptool` vs `airodump-ng` capture overlap risk

Both `HandshakeCaptureModule` (hcxdumptool) and `ScanModule` (airodump-ng) can run on `wlan_mon`. The RadioLeaseManager handles the conflict at the lease level, but:
- **hcxdumptool is incompatible with running alongside airodump-ng on the same interface** — they both put the interface in monitor mode and fight over channel control.
- This is not a lease conflict (both would request `monitor.scan`) but a **tool-level conflict** on the same physical interface.

**Fix:** `HandshakeCaptureModule` must request `monitor.locked` (not `monitor.scan`), which is incompatible with `ScanModule`'s `monitor.scan`. The lease table already defines this distinction — just ensure the module's handler requests the correct lease type. Add a comment in Section 6's lease table:
> *"monitor.locked is required by hcxdumptool captures; it conflicts with the ScanModule's monitor.scan lease, which is intentional — channel-hopping during capture corrupts the handshake."*

---

### 2.9 RF Operations — PMKID capture via fake Association may trigger AP-side alarms

The `PMKIDCaptureModule` sends `Dot11Auth + Dot11AssoReq` to the AP. On modern WPA3/PMF-enabled APs (and enterprise APs with WIDS), this **fake association attempt is logged and may trigger intrusion detection**. The plan doesn't acknowledge this.

**Fix:** Add a risk entry R21:
| R21 | PMKID fake association triggers AP WIDS alert | Med | Low | Document; warn in UI tooltip on the PMKID button; skip PMKID for WPA3-only targets automatically (use EAPOL-only capture path) |

---

### 2.10 Operational Gap — No "adapter health check" before attack start

Before any module acquires a `monitor.locked` lease and starts injecting, the plan has no step that verifies the adapter can actually inject. `aireplay-ng --test wlan_mon` is the standard check.

The `doctor.sh` script covers this at install time, but **not at runtime**. An adapter can lose injection capability after driver reload, USB re-plug, or kernel update without systemd restart.

**Fix:** Add a `pre_flight_check()` to `AdaptersModule` that runs before any `monitor.locked` lease is granted:
```python
async def pre_flight_check(iface: str) -> bool:
    result = await run("aireplay-ng", "--test", iface, timeout=10)
    return "Injection is working!" in result.stdout
```
Add a REST endpoint: `GET /api/adapters/{id}/injection-test` and expose a "Test Injection" button in the UI Adapter card.

---

### 2.11 Operational Gap — First-run wizard missing scope creation step

Section 10 shows the first-run wizard as:
```
POST /api/setup/create-user   {username, password}
```

But Section 5 says: *"The default scope ships with the three 'own networks' pre-populated."*

If the scope isn't created in the first-run wizard, the user hits the Recon page and immediately gets `403 NoActiveScope` on every attack attempt. This is a bad onboarding experience.

**Fix:** Add to Section 10 first-run endpoints:
```
POST /api/setup/create-scope   {name, allowed_bssids, activate}
```
And update the first-run wizard Phase 1 deliverable to include scope creation with the three known-good BSSIDs pre-populated from `config.toml`.

---

### 2.12 Frontend — Missing WebSocket reconnection strategy

Section 7 notes "native WebSocket + custom hook" but there is no mention of reconnection logic. The systemd service restarts on failure (`Restart=on-failure`), which will break the WS connection. Without auto-reconnect:
- The React UI goes stale and shows the last-known state indefinitely.
- The user won't know the backend restarted.

**Fix:** The `ws.ts` hook should implement:
1. Exponential backoff reconnect (1s → 2s → 4s → 8s → 16s max)
2. A visible "Reconnecting..." banner when the socket is not OPEN
3. On reconnect, call `GET /api/events?from=N` to replay missed events (the `replay_from` endpoint already exists in Section 10)

Add this to Phase 1 deliverables (it is cheap to do right and expensive to retrofit).

---

### 2.13 Frontend — No `Crack` route in the route list

Section 8 lists frontend routes: `Login`, `Dashboard`, `Recon`, `Targets`, `Attacks`, `EvilTwin`, `Captures`, `Credentials`, `Modules`, `Scope`, `Settings`. There is **no `Crack.tsx` route** even though the cracking API is fully specified in Section 10 and Phase 6 is a V1 feature.

**Fix:** Add `Crack.tsx` to the frontend route list (even if Phase 6 is gated behind a feature flag). Design the route now so the nav structure doesn't require a refactor later.

---

### 2.14 Testing — hwsim CI fixture not described

Section 18 references `mac80211_hwsim` fixtures but there is no `scripts/hwsim-lab.sh` spec or `tests/integration/hwsim/` fixture description. What does "4 virtual APs + 2 virtual STAs" mean concretely?

**Fix:** Add a `scripts/hwsim-lab.sh` spec to Section 18 or the project structure:
```bash
#!/bin/bash
# hwsim-lab.sh — spin up virtual radios for CI
sudo modprobe -r mac80211_hwsim 2>/dev/null
sudo modprobe mac80211_hwsim radios=6  # 4 APs + 2 STAs
# bring up hwsim0-5 with known MACs
# start 4 hostapd instances (NASA, NASA+, Camp, TestTarget)
# configure 2 wpa_supplicant instances as STAs
```
This is referenced in Validation criteria (Section 9 of the competitor analysis) but never defined as a runnable script.

---

### 2.15 Project Management — Timeline is optimistic for Phase 1

Phase 1 (Week 1) lists 18 separate deliverables including:
- Module core (`core/`, `orchestration/`)
- systemd service + udev rules
- DKMS install script
- First-run wizard (backend + UI)
- JWT auth + Argon2 + TLS
- Adapter discovery + WebSocket plumbing
- Dashboard page with live adapter cards
- Mode switch UI with progress
- DB migrations

At 20 hrs/week, that is ~20 hours for 18 significant deliverables. Several of these (pyroute2 adapter discovery, DKMS DKMS integration, module/job/event spine) are individually 4–8 hour tasks.

**Recommendation:** Split Phase 1 into two sub-phases:
- **Week 1a (Days 1–4):** module core + job queue + event bus + auth + DB migrations
- **Week 1b (Days 5–7):** adapter discovery + WebSocket + dashboard UI + mode switch

Adjust end-of-week demo to be achievable at 20 hrs.

---

### 2.16 Missing component — `config.toml` schema not specified

Multiple sections reference `config.toml` (Section 7 `pydantic-settings`, Section 17 captive detection bypass IPs, Section 14 service config), but **the actual TOML schema is never defined**.

**Fix:** Add a Section 28 (or sub-section in Section 7) with the `config.toml` schema:
```toml
[server]
host = "127.0.0.1"
port = 8443
tls_cert = "/etc/wcarck/tls.crt"
tls_key  = "/etc/wcarck/tls.key"

[database]
path = "/var/lib/wcarck/db.sqlite"

[adapters]
uplink_mac = "28:D0:43:0A:73:8C"
monitor_mac = "00:1E:A6:C6:57:44"
ap_mac = "5C:62:8B:76:5D:E2"

[captive_portal]
[captive_portal.captive_detection_bypass]
google = "172.217.5.78"
clients3_google = "172.217.11.174"
connectivitycheck = "172.217.5.78"

[scope.defaults]
allowed_bssids = ["30:4F:75:E8:23:90", "30:4F:75:E8:23:91", "32:4F:75:D8:23:90"]

[crack]
enabled = false   # Phase 6 opt-in
default_backend = "hashcat"
```

Without this, `pydantic-settings` integration is undefined and Phase 1 will invent schema ad-hoc.

---

## 3. Items to add to the Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R21 | PMKID fake association triggers AP WIDS | Med | Low | Warn in UI; skip for WPA3-only targets |
| R22 | `dnsmasq` port 53 conflict with `systemd-resolved` on Ubuntu 24.04 | **High** | **High** | `systemd-resolved` stubs port 53 on all Ubuntu 24.04 installs. Evil Twin dnsmasq will fail to bind. Fix: `install.sh` must disable `resolved` stub: `sed -i 's/#DNSStubListener=yes/DNSStubListener=no/' /etc/systemd/resolved.conf && systemctl restart systemd-resolved` |
| R23 | hcxdumptool capture file grows unbounded during long sessions | Med | Low | Cap file size via `--filterlist` or periodic rotation; add `max_capture_size_mb` config option |
| R24 | RTL8821AU refuses to enter AP mode on channel 157 (DFS) | Med | Med | Document; restrict Evil Twin channel picker to non-DFS channels (36, 40, 44, 48, 149, 153, 157 with DFS warning) for wlan_ap |
| R25 | Argon2 password hash blocks the asyncio event loop | Med | Med | Run `passlib.hash.argon2.hash()` in `asyncio.run_in_executor(None, ...)` — never call directly in an async handler |

> [!CAUTION]
> **R22 is a hard blocker.** Ubuntu 24.04 LTS (the primary target) runs `systemd-resolved` with a DNS stub listener on `127.0.0.53:53`. If `install.sh` does not disable this stub, `dnsmasq` will fail to bind port 53 on the AP interface and the Evil Twin will have no DNS hijack — the captive portal will never load on connected clients. This must be in `install.sh` before any Evil Twin testing.

---

## 4. Open Questions to add (Q18–Q22)

| # | Question | Impact |
|---|---|---|
| Q18 | Does the Ralink RT5370 (wlan_mon) support **simultaneous monitor + injection at high packet rates** with the `rt2800usb` driver on kernel 6.8? Some reports indicate frame drops > 200 pkt/s. | Phase 3 deauth effectiveness |
| Q19 | Should the `wcarck` systemd service user be in the `netdev` group for nl80211 operations, or is `CAP_NET_ADMIN` sufficient without group membership? | Phase 1 service setup |
| Q20 | What wordlist ships with Wcarck by default? (`rockyou.txt` is 139 MB; shipping it inflates the package.) | Phase 6 crack UX |
| Q21 | Should `wlan_ap` support **WPA3-SAE** Evil Twin or only WPA2-PSK? hostapd 2.10 supports SAE but driver support varies. | Phase 4 hostapd config |
| Q22 | Is `mdk4` a hard dependency or optional? It is listed in the apt package list (Section 7) but no module references it in V1. | Phase 1 install scope |

---

## 5. Minor corrections

| Location | Issue | Fix |
|---|---|---|
| Section 1 (Executive Summary) | Says "~7-week timeline at 20+ hrs/week" but roadmap has 6 phases with Phase 6 open-ended | Change to "6-week MVP, Phase 6 open-ended" |
| Section 9, `scopes` table | `UNIQUE(active) WHERE active = 1` is a SQLite partial unique index — valid syntax, but SQLAlchemy 2.0 async needs `UniqueConstraint` with `sqlite_where` kwarg | Add a note for the ORM layer |
| Section 10 | `/api/attacks/probe-harvest` is listed under Attacks but `ProbeHarvestModule` is not in the built-in module list (Section 26.2) | Add `ProbeHarvestModule` to the built-in list or rename to be part of `ScanModule` |
| Section 15 | `curl -sSL https://wcarck.local/install.sh | sudo bash` references a non-existent domain | Change to a local file path or GitHub Releases URL |
| Section 17 | `starbucks.html` template — Starbucks is a registered trademark. Using their brand in a phishing portal is trademark infringement regardless of GPL license | Rename template to `coffee_shop/` with generic branding; add a note that operators can customize the logo/brand |
| Competitor analysis §2.2 | Code sample calls `asyncio.create_subprocess_exec` without `await` on the `deauth` line | Should be `deauth = await asyncio.create_subprocess_exec(...)` |

---

## 6. What the competitor analysis could add

The competitor analysis is already excellent. Two small additions would close gaps:

1. **bettercap's `Requires` dependency system** (mentioned in the executive table but not detailed). Wcarck modules should declare their required external tools (from `ExternalTool` registry) so the job runner can fail fast with "missing dependency: hcxdumptool" instead of a cryptic subprocess error.

2. **Karma/MANA attack pattern from hostapd-mana** is listed in Phase 5 but no competitor analysis covers it. A brief §3.7 on `hostapd-mana`'s `enable_karma=1` config and how to wire it into `EvilTwinModule` would help Phase 5.

---

## 7. Pre-implementation checklist (before v0.2.0 repo scaffold)

- [ ] Boot Ubuntu and run `Q1–Q8` diagnostic commands (`uname -r`, `iw list`, `lsusb`)
- [ ] Verify `systemd-resolved` stub listener conflict on your Ubuntu version
- [ ] Test RTL8821AU injection capability with `aireplay-ng --test wlan_ap`
- [ ] Confirm `dnsmasq` binds cleanly on the AP interface after resolving R22
- [ ] Add `sha256` column to `captures` table and define the lightweight `artifacts` table
- [ ] Resolve `attack_sessions` / `job_queue` status duplication
- [ ] Add `Crack.tsx` route to frontend structure
- [ ] Define `config.toml` schema in the plan
- [ ] Remove `CAP_SYS_ADMIN` from production systemd unit
- [ ] Resolve `ReportModule` position in module priority list (defer to Phase 5)
- [ ] Rename `starbucks` template to generic `coffee_shop`

---

*End of review — Wcarck plan is implementation-ready after addressing items 2.2, 2.3, 2.11, and R22 (hard blockers).*
