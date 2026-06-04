# Wcarck — UI/UX Design Specification

**Version:** 1.0  
**Tech Stack:** React 18 + TailwindCSS 3.4 + shadcn/ui + Recharts + TanStack Table  
**Design Language:** Ubuntu Adwaita-inspired dark mode with glassmorphism accents

---

## 0. Design Philosophy — Four Pillars

### Pillar 1: Power Without Intimidation

A naive user opens Wcarck for the first time. They should:
1. Immediately understand what they're looking at (dashboard = overview)
2. Know what to do next (guided action bar: "Start a scan →")
3. Never encounter jargon without explanation (every term has a tooltip)
4. Feel confident clicking anything (nothing destructive happens without a confirmation modal)

### Pillar 2: Dense Information, Zero Clutter

A pentest operator needs to see 30+ networks, signal strengths, client counts,
running jobs, adapter states, and captured handshakes — all simultaneously. The
UI must pack information tightly while maintaining visual hierarchy through:
- **Color intensity** for importance (bright = active/important, dim = passive)
- **Size** for hierarchy (large numbers for key metrics, small text for details)
- **Motion** for state (pulsing = active job, static = idle)

### Pillar 3: The 3-Click Rule

Every primary workflow completes in ≤3 clicks:
- **Scan → Deauth → Capture:** Click "Scan" → click network row → click "Attack"
- **Evil Twin:** Click "Evil Twin" on target → select template → click "Launch"
- **Crack:** Click "Crack" on a capture → select wordlist → click "Start"

### Pillar 4: Alive, Not Animated

The UI should feel alive — data streaming in, counters ticking, signal bars
fluctuating. But never gratuitously animated. Every animation serves a purpose:
- Fade-in: new data arrived
- Pulse: something is actively running
- Slide: a panel opened/closed
- Shake: an error occurred

No spinners, no bouncing dots, no skeleton screens that last >200ms. If data
isn't ready in 200ms, show the previous state with a subtle loading indicator
in the corner — never blank the screen.

---

## 1. Design System — Tokens & Primitives

### 1.1 Color Palette

The palette is dark-first, inspired by Ubuntu's Yaru dark theme but shifted
toward a cooler blue-gray base with vibrant accent colors for RF-specific states.

```css
:root {
  /* ─── Base Surface ─── */
  --bg-root:        hsl(225, 15%, 8%);     /* #121318 — deepest background */
  --bg-surface:     hsl(225, 14%, 11%);    /* #181a21 — card/panel background */
  --bg-elevated:    hsl(225, 13%, 14%);    /* #1f2129 — elevated cards, modals */
  --bg-hover:       hsl(225, 12%, 17%);    /* #272a33 — hover state on cards */
  --bg-active:      hsl(225, 11%, 20%);    /* #2f323d — pressed/active state */

  /* ─── Border ─── */
  --border-subtle:  hsl(225, 10%, 18%);    /* barely visible card edges */
  --border-default: hsl(225, 10%, 24%);    /* form inputs, dividers */
  --border-strong:  hsl(225, 10%, 32%);    /* focused inputs */

  /* ─── Text ─── */
  --text-primary:   hsl(220, 20%, 93%);    /* #eceef4 — headings, primary content */
  --text-secondary: hsl(220, 12%, 65%);    /* #9a9eb0 — descriptions, labels */
  --text-tertiary:  hsl(220, 8%, 45%);     /* #6b6f7e — timestamps, muted info */
  --text-disabled:  hsl(220, 5%, 30%);     /* disabled controls */

  /* ─── Accent: Ubuntu Orange (primary action) ─── */
  --accent:         hsl(18, 90%, 56%);     /* #E95420 — Ubuntu signature orange */
  --accent-hover:   hsl(18, 90%, 48%);     /* darker on hover */
  --accent-glow:    hsl(18, 90%, 56%, 0.15); /* glow behind active buttons */
  --accent-text:    hsl(18, 90%, 70%);     /* orange text for links/actions */

  /* ─── Semantic: Status Colors ─── */
  --status-running:  hsl(142, 60%, 50%);   /* #3dba6a — green pulse for active jobs */
  --status-success:  hsl(142, 55%, 42%);   /* darker green for completed */
  --status-warning:  hsl(38, 92%, 55%);    /* #e8a830 — amber for warnings */
  --status-error:    hsl(0, 72%, 56%);     /* #d94848 — red for errors */
  --status-info:     hsl(210, 80%, 60%);   /* #4a90d9 — blue for info */
  --status-idle:     hsl(220, 10%, 40%);   /* gray for idle/stopped */

  /* ─── RF-Specific Colors ─── */
  --rf-signal-strong: hsl(142, 60%, 50%);  /* -30 to -50 dBm */
  --rf-signal-good:   hsl(80, 55%, 50%);   /* -50 to -65 dBm */
  --rf-signal-weak:   hsl(38, 80%, 55%);   /* -65 to -75 dBm */
  --rf-signal-poor:   hsl(0, 65%, 50%);    /* -75 to -90 dBm */

  --rf-band-24:     hsl(200, 70%, 55%);    /* 2.4 GHz = blue */
  --rf-band-5:      hsl(280, 60%, 60%);    /* 5 GHz = purple */

  --rf-wpa2:        hsl(142, 50%, 45%);    /* WPA2 badge */
  --rf-wpa3:        hsl(210, 70%, 55%);    /* WPA3 badge */
  --rf-wep:         hsl(0, 60%, 50%);      /* WEP badge (insecure) */
  --rf-open:        hsl(38, 80%, 55%);     /* Open badge (warning) */

  /* ─── Glass Effect ─── */
  --glass-bg:       hsl(225, 15%, 12%, 0.7);
  --glass-border:   hsl(225, 15%, 25%, 0.4);
  --glass-blur:     12px;
}
```

### 1.2 Typography

```css
/* Primary: Inter — clean, modern, excellent legibility at small sizes */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

/* Monospace: JetBrains Mono — for MACs, IPs, hex, terminal output */
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap');

:root {
  --font-sans:  'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono:  'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;

  /* Type Scale (modular, 1.2 ratio) */
  --text-xs:    0.6875rem;   /* 11px — timestamps, badge labels */
  --text-sm:    0.8125rem;   /* 13px — table cells, secondary text */
  --text-base:  0.875rem;    /* 14px — body text, descriptions */
  --text-md:    1rem;        /* 16px — card titles, nav items */
  --text-lg:    1.25rem;     /* 20px — page titles */
  --text-xl:    1.5rem;      /* 24px — dashboard metric numbers */
  --text-2xl:   2rem;        /* 32px — hero metrics on dashboard */
  --text-3xl:   2.75rem;     /* 44px — giant counters */

  /* Weights */
  --weight-normal:  400;
  --weight-medium:  500;
  --weight-semi:    600;
  --weight-bold:    700;

  /* Line heights */
  --leading-tight:  1.2;
  --leading-normal: 1.5;
  --leading-relaxed: 1.7;
}
```

### 1.3 Spacing Scale

```css
:root {
  --space-0:   0;
  --space-1:   0.25rem;    /* 4px */
  --space-2:   0.5rem;     /* 8px */
  --space-3:   0.75rem;    /* 12px */
  --space-4:   1rem;       /* 16px */
  --space-5:   1.25rem;    /* 20px */
  --space-6:   1.5rem;     /* 24px */
  --space-8:   2rem;       /* 32px */
  --space-10:  2.5rem;     /* 40px */
  --space-12:  3rem;       /* 48px */
  --space-16:  4rem;       /* 64px */
}
```

### 1.4 Border Radius

Ubuntu Adwaita uses generous radius. We follow suit:

```css
:root {
  --radius-sm:   6px;    /* badges, tags */
  --radius-md:   10px;   /* buttons, inputs */
  --radius-lg:   14px;   /* cards */
  --radius-xl:   20px;   /* modals, large panels */
  --radius-full: 9999px; /* pills, avatars, dots */
}
```

### 1.5 Elevation & Shadows

```css
:root {
  --shadow-sm:  0 1px 3px hsl(225, 20%, 4%, 0.4);
  --shadow-md:  0 4px 12px hsl(225, 20%, 4%, 0.5);
  --shadow-lg:  0 8px 30px hsl(225, 20%, 4%, 0.6);
  --shadow-glow-accent: 0 0 20px hsl(18, 90%, 56%, 0.15);
  --shadow-glow-green:  0 0 12px hsl(142, 60%, 50%, 0.2);
  --shadow-glow-red:    0 0 12px hsl(0, 72%, 56%, 0.2);
}
```

### 1.6 Animation

```css
:root {
  /* Durations */
  --duration-instant:  100ms;
  --duration-fast:     150ms;
  --duration-normal:   250ms;
  --duration-slow:     400ms;

  /* Easing — Ubuntu uses ease-in-out for most, spring for interactive */
  --ease-default:  cubic-bezier(0.25, 0.1, 0.25, 1);        /* smooth default */
  --ease-spring:   cubic-bezier(0.34, 1.56, 0.64, 1);       /* overshoot bounce */
  --ease-out:      cubic-bezier(0, 0, 0.2, 1);              /* decelerate */
  --ease-in:       cubic-bezier(0.4, 0, 1, 1);              /* accelerate */
}

/* Keyframes */
@keyframes pulse-green {
  0%, 100% { box-shadow: 0 0 0 0 hsl(142, 60%, 50%, 0.4); }
  50%      { box-shadow: 0 0 0 6px hsl(142, 60%, 50%, 0); }
}

@keyframes pulse-orange {
  0%, 100% { box-shadow: 0 0 0 0 hsl(18, 90%, 56%, 0.3); }
  50%      { box-shadow: 0 0 0 6px hsl(18, 90%, 56%, 0); }
}

@keyframes fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes slide-in-right {
  from { opacity: 0; transform: translateX(12px); }
  to   { opacity: 1; transform: translateX(0); }
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%      { transform: translateX(-3px); }
  40%      { transform: translateX(3px); }
  60%      { transform: translateX(-2px); }
  80%      { transform: translateX(2px); }
}

@keyframes count-up {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

---

## 2. Layout Architecture

### 2.1 Master Layout — The Three Zones

```
┌──────────────────────────────────────────────────────────────────────┐
│ TOPBAR  (48px, fixed, glass effect)                                  │
│ [☰] [W] Wcarck               Session: "NASA Audit" ●        [⚙] │
├───────┬──────────────────────────────────────────────────────────────┤
│       │                                                              │
│  S    │   CONTENT ZONE                                               │
│  I    │                                                              │
│  D    │   (scrollable, padded 24px)                                  │
│  E    │                                                              │
│  B    │   ┌─────────────────────────┐  ┌─────────────────────────┐  │
│  A    │   │  Card / Table / Panel   │  │  Card / Table / Panel   │  │
│  R    │   │                         │  │                         │  │
│       │   └─────────────────────────┘  └─────────────────────────┘  │
│  64px │                                                              │
│  wide │   ┌─────────────────────────────────────────────────────┐   │
│  (col │   │  Full-width content (tables, charts)                │   │
│  lap- │   │                                                     │   │
│  sib- │   └─────────────────────────────────────────────────────┘   │
│  le)  │                                                              │
│       ├──────────────────────────────────────────────────────────────┤
│       │ CONTEXTUAL PANEL  (slide-in from right, 380px wide)          │
│       │ (appears when clicking a row: network detail, job detail)    │
└───────┴──────────────────────────────────────────────────────────────┘
```

### 2.2 Sidebar — Icon-Only by Default, Expands on Hover

The sidebar is **64px wide by default** (icon-only). On hover it smoothly
expands to **220px** (icons + text labels). This maximizes the content zone
while keeping navigation always accessible.

```
  ┌──────────┐
  │    ◉     │  Dashboard          ← active: accent left border + accent icon
  │    ◎     │  Recon              ← subtle hover bg
  │    ◎     │  Targets
  │    ◎     │  Attacks
  │    ◎     │  Evil Twin
  │    ◎     │  Captures
  │    ◎     │  Credentials
  │    ◎     │  Crack
  │          │
  │  ─────  │  ← divider
  │    ◎     │  Adapters
  │    ◎     │  Logs               ← red dot badge if errors exist
  │    ◎     │  Settings
  └──────────┘
```

**Icon selection** (lucide-react):
| Page | Icon | Why |
|---|---|---|
| Dashboard | `LayoutDashboard` | Standard dashboard icon |
| Recon | `Radar` | Scanning = radar sweep |
| Targets | `Crosshair` | Targeting = crosshair |
| Attacks | `Zap` | Lightning = fast attack |
| Evil Twin | `Ghost` | Ghost = impersonation |
| Captures | `FileDown` | Downloaded capture file |
| Credentials | `KeyRound` | Keys = passwords |
| Crack | `Hammer` | Breaking = cracking |
| Adapters | `Wifi` | WiFi hardware |
| Logs | `ScrollText` | Log file |
| Settings | `Settings` | Gear |

**Sidebar animation:**
```css
.sidebar {
  width: 64px;
  transition: width var(--duration-normal) var(--ease-default);
  overflow: hidden;
}
.sidebar:hover,
.sidebar.pinned {
  width: 220px;
}
.sidebar__label {
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-default);
  white-space: nowrap;
}
.sidebar:hover .sidebar__label,
.sidebar.pinned .sidebar__label {
  opacity: 1;
}
```

**Active indicator:** A 3px wide, 24px tall rounded pill on the left edge,
colored `--accent`. Smoothly slides to the active item with
`transform: translateY(...)` and `--ease-spring`.

### 2.3 Topbar — System Status at a Glance

```
 ┌─────────────────────────────────────────────────────────────────┐
 │ [☰]  [W] Wcarck      Session: "NASA Audit" 48m ●    🟢 🟡 🔴  │
 │                                                       ^  ^  ^   │
 │                                           wlan_uplink │  │  │   │
 │                                             wlan_mon ─┘  │  │   │
 │                                              wlan_ap ────┘  │   │
 │                                                  ○ errors ──┘   │
 └─────────────────────────────────────────────────────────────────┘
```

**Left zone:**
- Hamburger menu `[☰]` — pins/unpins the sidebar
- Wcarck logo mark (a small stylized "W" in accent orange) + "Wcarck" text

**Center zone:**
- Current session label and elapsed time (live counter, ticks every second)
- Green dot = session active, gray dot = no session

**Right zone:**
- **Three adapter status dots** — each is a small colored circle:
  - 🟢 Green = online + in correct mode
  - 🟡 Amber = transitioning / mode change in progress
  - 🔴 Red = gone / error
  - ⚪ Gray = not connected
  - Hover any dot → tooltip: "wlan_mon — monitor mode — ch 1 — rt2800usb"
- **Error count badge** — red pill badge showing count of errors in current session.
  Click → opens the Error Inspector panel.

---

## 3. Page Designs

### 3.1 Dashboard — The Command Center

The dashboard is the first thing the user sees. It must:
1. Answer "what's happening right now?" in <1 second of scanning
2. Provide one-click access to the most common next action
3. Show system health without requiring navigation

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                    │
│  GUIDED ACTION BAR  (only shows when no active jobs)               │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  ▶  Ready to start. Click "Start Scan" to discover nearby   │  │
│  │     networks, or select a previous session to continue.     │  │
│  │                                                              │  │
│  │     [ Start Scan → ]        [ Resume Session #3 ]           │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  METRIC CARDS (4 columns, equal width)                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │ Networks │  │ Clients  │  │ Handshk  │  │ Creds    │          │
│  │          │  │          │  │          │  │          │          │
│  │   12     │  │   34     │  │    1     │  │    2     │          │
│  │ +3 new   │  │ +7 new   │  │ ✓ valid  │  │ 1 valid  │          │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘          │
│                                                                    │
│  ACTIVE JOBS  (collapsible section, open by default)               │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  🟢  Scan (continuous)    wlan_mon   ch 1-13   34 nets      │  │
│  │       ████████████████████░░░░░░░  running 12m              │  │
│  │                                              [ ■ Stop ]     │  │
│  │                                                              │  │
│  │  🟢  Deauth              wlan_mon   NASA      AA:BB:CC...   │  │
│  │       ████████████████████████████  47,231 frames            │  │
│  │                                              [ ■ Stop ]     │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ADAPTERS (3 horizontal cards)                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │ wlan_uplink  │  │ wlan_mon     │  │ wlan_ap      │            │
│  │ MT7902       │  │ RT5370       │  │ RTL8821AU    │            │
│  │              │  │              │  │              │            │
│  │  managed     │  │  monitor ●   │  │  managed     │            │
│  │  internet    │  │  ch 6        │  │  idle        │            │
│  │  ────────    │  │  ────────    │  │  ────────    │            │
│  │  RX: 1.2K/s │  │  RX: 340/s  │  │  RX: 0      │            │
│  │  TX: 89/s   │  │  TX: 64/s   │  │  TX: 0      │            │
│  └──────────────┘  └──────────────┘  └──────────────┘            │
│                                                                    │
│  RECENT EVENTS  (live feed, last 20 events, auto-scrolling)       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  21:05:44  ✓ Handshake captured   NASA  4-EAPOL            │  │
│  │  21:05:33  ⚡ Deauth burst sent   NASA  64 frames          │  │
│  │  21:05:00  ▶ Deauth started       NASA  → AA:BB:CC:DD      │  │
│  │  21:02:44  📡 Network found        NASA  ch1 -47dBm WPA2   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

**Metric card behavior:**
- Number animates with `count-up` keyframe when value changes
- "+3 new" is a fade-in/fade-out badge showing delta since last check
- Card has a subtle gradient border-bottom in the semantic color
  (green for handshakes, amber for credentials)
- Click card → navigates to the corresponding page

**Active Jobs section:**
- Each job row shows: status dot (pulsing green), job type, adapter, target info
- Progress bar uses a gradient fill (accent orange)
- "Stop" button is a small rounded `destructive` variant button
- When a job completes, the row fades out upward over 300ms and the section
  collapses if empty

**Adapter cards:**
- Show RX/TX as live-updating numbers (Zustand subscription, <100ms updates)
- Mode badge is a colored pill:
  - `monitor` = green pill with pulse animation
  - `managed` = gray pill
  - `ap` = purple pill with glow
  - `transitioning...` = amber pill with shimmer animation
- Click adapter card → "Set Monitor" / "Set Managed" button appears in the card
  with a smooth height expansion

**Recent Events feed:**
- WebSocket-fed, newest on top
- Each event has a semantic icon + color-coded text
- Auto-scrolls to newest, pauses on hover
- Click any event → right panel opens with full detail

---

### 3.2 Recon Page — Network Discovery

This is the most data-dense page. It must handle 50+ networks without jank.

```
┌──────────────────────────────────────────────────────────────────┐
│  Recon                                                            │
│                                                                    │
│  CONTROLS BAR                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  [ ▶ Start Scan ]  Band: [ 2.4 GHz ▾]  Adapter: [wlan_mon] │  │
│  │                                                              │  │
│  │  Filter: [____________]   Show: [All ▾]  Sort: [Signal ▾]  │  │
│  │          search by SSID/BSSID/vendor                         │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  NETWORK TABLE  (TanStack Table + virtualization)                  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  ▼  SSID           BSSID           CH  Band  Sig  Enc  Clnt │  │
│  │  ├────────────────────────────────────────────────────────── │  │
│  │  │  NASA           30:4F:75:E8:2…   1  2.4   ████  WPA2  3 │  │
│  │  │                                         -47dBm           │  │
│  │  │  NASA+          30:4F:75:E8:2… 157  5    ███   WPA2  1 │  │
│  │  │                                         -62dBm           │  │
│  │  │  Camp           32:4F:75:D8:2…   1  2.4   ████  WPA2  0 │  │
│  │  │                                         -51dBm           │  │
│  │  │  Akhilesh       AA:BB:CC:DD:E…   6  2.4   ██    WPA2  2 │  │
│  │  │                                         -71dBm     ⚠PMF │  │
│  │  │  ───────────────────────────────────────────────────────  │  │
│  │  │  (25 more networks)                                      │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  When a row is CLICKED, the right panel slides in:                 │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    NETWORK DETAIL PANEL (380px)              │  │
│  │                                                              │  │
│  │  NASA                                            [ × Close ] │  │
│  │  30:4F:75:E8:23:90                                          │  │
│  │                                                              │  │
│  │  ┌────────── Signal History (last 5 min) ──────────┐        │  │
│  │  │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓                 │        │  │
│  │  │  -45          sparkline chart              -50  │        │  │
│  │  └─────────────────────────────────────────────────┘        │  │
│  │                                                              │  │
│  │  Channel: 1  │  Band: 2.4 GHz  │  Speed: 54 Mbps           │  │
│  │  Encryption: WPA2-PSK  │  Cipher: CCMP                     │  │
│  │  PMF: Capable (not required)  ⓘ                             │  │
│  │  Vendor: Bharti Airtel (Netgear OEM)                        │  │
│  │  First seen: 21:01:12  │  Last seen: 21:48:01               │  │
│  │  Beacons: 12,340  │  Data frames: 8,921                    │  │
│  │                                                              │  │
│  │  CONNECTED CLIENTS (3)                                      │  │
│  │  ┌──────────────────────────────────────────────┐           │  │
│  │  │  AA:BB:CC:DD:EE:FF   Apple, Inc.   -52dBm   │           │  │
│  │  │  11:22:33:44:55:66   Samsung        -68dBm   │           │  │
│  │  │  ee:6a:bc:11:22:33   Random MAC 🔀  -74dBm   │           │  │
│  │  └──────────────────────────────────────────────┘           │  │
│  │                                                              │  │
│  │  ACTIONS                                                    │  │
│  │  ┌──────────────────────────────────────────────┐           │  │
│  │  │  [ ⚡ Deauth All ]  [ ⚡ Deauth Client ▾ ]   │           │  │
│  │  │  [ 📥 Capture Handshake ]  [ 📥 PMKID ]     │           │  │
│  │  │  [ 👻 Evil Twin → ]                          │           │  │
│  │  └──────────────────────────────────────────────┘           │  │
│  │                                                              │  │
│  └──────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

**Signal bar visualization:**
Four vertical bars with height proportional to signal strength. Color changes
dynamically: green → yellow → orange → red as signal weakens.

```typescript
function SignalBars({ rssi }: { rssi: number }) {
  const strength = rssiToStrength(rssi)   // 0-4
  const color = rssiToColor(rssi)
  return (
    <div className="flex items-end gap-[2px] h-4">
      {[1, 2, 3, 4].map(i => (
        <div
          key={i}
          className="w-[3px] rounded-full transition-all duration-150"
          style={{
            height: `${i * 25}%`,
            backgroundColor: i <= strength ? color : 'var(--border-subtle)',
          }}
        />
      ))}
    </div>
  )
}
```

**Encryption badges:**
```
WPA2    → green rounded pill
WPA3    → blue rounded pill
WPA2+3  → gradient pill (green→blue)
WEP     → red pill with "!" icon
Open    → amber pill with "⚠" icon
```

**PMF indicator:**
If PMF is detected, a small `⚠PMF` badge appears next to the encryption pill.
Hover → tooltip: "Management Frame Protection is active. Deauth may not work
against all clients on this network. Consider using PMKID capture instead."

**Row hover effect:**
Background transitions to `--bg-hover` over `--duration-fast`. A subtle
border-left accent line (3px, `--accent`) fades in on the selected row.

**Row click behavior:**
1. Row gets a `--bg-active` background with a left-side accent border
2. The detail panel slides in from the right edge over `--duration-normal`
   with `--ease-out`
3. Content area width shrinks by 380px to accommodate the panel (no overlap)
4. Click another row → panel content cross-fades (opacity transition, 150ms)
5. Click the same row again or "×" → panel slides out, content expands back

**Empty state (no networks found):**
```
┌──────────────────────────────────────────────────────────────┐
│                                                                │
│                   📡                                           │
│                                                                │
│          No networks found yet.                                │
│                                                                │
│    Start a scan to discover nearby WiFi networks.              │
│    Make sure wlan_mon is in monitor mode.                      │
│                                                                │
│          [ ▶ Start Scan ]                                      │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

---

### 3.3 Attacks Page — Active Operations Control

```
┌──────────────────────────────────────────────────────────────────┐
│  Attacks                                                          │
│                                                                    │
│  ACTIVE ATTACKS  (live, pulsing section)                           │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                                                              │  │
│  │  DEAUTH ⚡                                             [■]   │  │
│  │  Target: NASA (30:4F:75:E8:23:90) → AA:BB:CC:DD:EE:FF      │  │
│  │  Adapter: wlan_mon  │  Channel: 1  │  Method: aireplay-ng   │  │
│  │                                                              │  │
│  │  ┌─────────────────────────────────────────────────┐        │  │
│  │  │  Frames sent    Duration     Rate               │        │  │
│  │  │    47,231         12m 04s      65 pkt/s          │        │  │
│  │  │                                                  │        │  │
│  │  │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  ← packet rate │        │  │
│  │  │  (mini sparkline of packet rate over time)       │        │  │
│  │  └─────────────────────────────────────────────────┘        │  │
│  │                                                              │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  CAPTURE IN PROGRESS                                               │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                                                              │  │
│  │  HANDSHAKE CAPTURE 📥                                  [■]   │  │
│  │  Target: NASA (30:4F:75:E8:23:90)                           │  │
│  │  Adapter: wlan_mon  │  Tool: hcxdumptool                    │  │
│  │                                                              │  │
│  │  EAPOL Progress:   M1 ✓   M2 ✓   M3 ◌   M4 ◌              │  │
│  │                    ████████████░░░░░░░░░░░░  2/4             │  │
│  │                                                              │  │
│  │  Capture file: NASA_30_4F_75_E8_23_90.pcapng  (2.4 MB)     │  │
│  │  Duration: 3m 22s                                            │  │
│  │                                                              │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ATTACK HISTORY  (past attacks from this session)                  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Time     Type      Target   Duration  Frames  Status       │  │
│  │  21:01    Deauth    NASA     4m 12s    31,204  ✓ Complete   │  │
│  │  20:55    Deauth    Camp     1m 03s     4,032  ■ Stopped    │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

**EAPOL progress visualization — the signature UX element:**

```
  M1  ──→  M2  ──→  M3  ──→  M4
  ●────────●────────○────────○
  ✓        ✓        ◌        ◌
```

- Each M node is a circle (16px diameter)
- ✓ captured = solid green circle with checkmark icon
- ◌ waiting = hollow gray circle
- The connecting line fills with green from left to right as messages arrive
- When M4 arrives, the entire bar flashes green once and a "🎉 Handshake
  captured!" toast notification appears for 4 seconds

```css
.eapol-node {
  width: 16px; height: 16px;
  border-radius: 50%;
  border: 2px solid var(--border-default);
  transition: all var(--duration-normal) var(--ease-spring);
}
.eapol-node.captured {
  background: var(--status-running);
  border-color: var(--status-running);
  animation: pulse-green 2s infinite;
}
.eapol-line {
  height: 2px;
  flex: 1;
  background: var(--border-subtle);
  position: relative;
}
.eapol-line::after {
  content: '';
  position: absolute;
  height: 100%;
  background: var(--status-running);
  transition: width var(--duration-slow) var(--ease-out);
}
```

---

### 3.4 Evil Twin Page — Guided Workflow

This page is the most complex workflow and the most likely place a naive user
gets confused. Solution: a **step-by-step wizard** with clear progress.

```
┌──────────────────────────────────────────────────────────────────┐
│  Evil Twin                                                        │
│                                                                    │
│  STEP INDICATOR                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │    ① Target    ──→    ② Template    ──→    ③ Launch          │  │
│  │    ●══════════════════●══════════════════════○               │  │
│  │    ✓ Selected         ● Current               Pending       │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  STEP 2: Choose Portal Template                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                                                              │  │
│  │  Target: NASA (30:4F:75:E8:23:90) — WPA2-PSK — Channel 1   │  │
│  │                                                              │  │
│  │  Select a captive portal template:                           │  │
│  │                                                              │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐ │  │
│  │  │                │  │                │  │                │ │  │
│  │  │  [Router       │  │  [Coffee Shop  │  │  [Airport      │ │  │
│  │  │   Update       │  │   WiFi]        │  │   WiFi]        │ │  │
│  │  │   Preview]     │  │                │  │                │ │  │
│  │  │                │  │                │  │                │ │  │
│  │  │  ● Router      │  │  ○ Coffee      │  │  ○ Airport     │ │  │
│  │  │    Update      │  │    Shop        │  │    WiFi        │ │  │
│  │  │  ─────────     │  │  ─────────     │  │  ─────────     │ │  │
│  │  │  Firmware      │  │  Free WiFi     │  │  Connection    │ │  │
│  │  │  update prompt │  │  login page    │  │  portal        │ │  │
│  │  └────────────────┘  └────────────────┘  └────────────────┘ │  │
│  │                                                              │  │
│  │  ┌────────────────┐  ┌────────────────┐                     │  │
│  │  │  [Hotel WiFi]  │  │  [Custom...]   │                     │  │
│  │  │                │  │                │                     │  │
│  │  │  ○ Hotel       │  │  ○ Upload      │                     │  │
│  │  │    WiFi        │  │    Custom      │                     │  │
│  │  │  ─────────     │  │  ─────────     │                     │  │
│  │  │  Hotel room    │  │  Your own HTML │                     │  │
│  │  │  check-in      │  │  template      │                     │  │
│  │  └────────────────┘  └────────────────┘                     │  │
│  │                                                              │  │
│  │           [ ← Back ]                 [ Next: Launch → ]     │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

**Template cards:**
- Each is 180×200px with a thumbnail preview of the portal page
- Radio button selection (only one at a time)
- Selected card gets an accent border glow + slight scale-up (1.02)
- Hover → subtle lift (translateY -2px) + shadow increase

**Step 3: Launch (confirmation screen):**
```
┌──────────────────────────────────────────────────────────┐
│  LAUNCH CONFIRMATION                                      │
│                                                            │
│  You are about to:                                         │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  Create an Evil Twin of:                              │ │
│  │    SSID:     NASA                                     │ │
│  │    Channel:  1 (2.4 GHz)                              │ │
│  │    Adapter:  wlan_ap (RTL8821AU)                      │ │
│  │    Template: Router Update                            │ │
│  │                                                        │ │
│  │  This will:                                            │ │
│  │    • Start hostapd on wlan_ap                         │ │
│  │    • Start dnsmasq (DHCP + DNS hijack)                │ │
│  │    • Serve the captive portal on 10.0.0.1             │ │
│  │    • Deauth clients from the real NASA AP             │ │
│  │                                                        │ │
│  │  ⚠ wlan_ap will switch from monitor to AP mode.      │ │
│  │    5 GHz monitoring will be unavailable during this    │ │
│  │    session.                                            │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  [ ← Back ]                    [ 🚀 Launch Evil Twin ]    │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

**During Evil Twin operation — live monitoring dashboard:**
```
┌──────────────────────────────────────────────────────────┐
│  Evil Twin ACTIVE  🟢  ●                          [■ Stop] │
│                                                            │
│  NASA (Evil Twin) — Channel 1 — wlan_ap                   │
│  ──────────────────────────────────────────────────────── │
│                                                            │
│  METRICS                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ Clients  │  │ Creds    │  │ Valid    │  │ Uptime   │ │
│  │   5      │  │   3      │  │   1 ✓   │  │  14:22   │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
│                                                            │
│  CONNECTED CLIENTS                                         │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  IP         MAC               Device      Status    │ │
│  │  10.0.0.2   AA:BB:CC:DD:..    iPhone 14   Portal ✓ │ │
│  │  10.0.0.3   11:22:33:44:..    Galaxy S23  Browsing │ │
│  │  10.0.0.4   ee:6a:bc:11:..    Random MAC  New      │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  CREDENTIAL FEED (live)                                    │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  21:35:01  10.0.0.2  password123  ✓ VALID  🎉       │ │
│  │  21:33:45  10.0.0.3  wrongpass    ✗ Invalid          │ │
│  │  21:32:11  10.0.0.4  admin1234    ✗ Invalid          │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

**Credential capture animation:**
When a valid credential arrives:
1. The row slides in from the right with `slide-in-right` over 300ms
2. The row background flashes green once (400ms)
3. A confetti-free "🎉" emoji pulses next to the VALID badge
4. The `Creds` and `Valid` metric cards count-up animate

---

### 3.5 Captures Page

```
┌──────────────────────────────────────────────────────────────────┐
│  Captures                                                         │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  SSID         BSSID          Type     Status  Size   Date   │  │
│  │  ───────────────────────────────────────────────────────────  │  │
│  │  NASA         30:4F:75:..    EAPOL    ✓ Valid 2.4MB  21:05  │  │
│  │               4/4 messages  │  .22000 ready  │  [ 📥 ] [⚡] │  │
│  │                                                              │  │
│  │  NASA         30:4F:75:..    PMKID    ✓ Valid 1.1KB  21:10  │  │
│  │               PMKID hash   │  .22000 ready  │  [ 📥 ] [⚡] │  │
│  │                                                              │  │
│  │  Camp         32:4F:75:..    EAPOL    ⚠ Partial     21:15  │  │
│  │               2/4 messages  │  incomplete    │  [ 🔄 ]      │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  [ 📥 ] = Download .22000 file                                    │
│  [ ⚡ ] = Send to Crack                                            │
│  [ 🔄 ] = Re-capture                                               │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

**Capture status visual:**
- `✓ Valid` — green pill, download button enabled
- `⚠ Partial` — amber pill, "Re-capture" button shown
- `✗ Invalid` — red pill, "Retry" button shown
- EAPOL progress: inline `M1 ✓ M2 ✓ M3 ✗ M4 ✗` mini-display

---

### 3.6 Credentials Page

```
┌──────────────────────────────────────────────────────────────────┐
│  Credentials                                                      │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  SSID     Password        Client         Validated   Time   │  │
│  │  ──────────────────────────────────────────────────────────  │  │
│  │  NASA     p@ssword123     10.0.0.2       ✓ Valid     21:35  │  │
│  │           [👁 Show] [📋 Copy]    iPhone 14                  │  │
│  │                                                              │  │
│  │  NASA     wrongpassword   10.0.0.3       ✗ Invalid   21:33  │  │
│  │           [👁 Show] [📋 Copy]    Galaxy S23                 │  │
│  │                                                              │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  The password field is masked by default (••••••••••)              │
│  Click [👁 Show] to reveal, auto-hides after 10 seconds           │
│  Click [📋 Copy] copies to clipboard with a brief "Copied!" toast │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

**Password reveal UX:**
- Default: `••••••••••` (masked)
- Click eye icon → password visible for 10 seconds, then auto-masks
- The eye icon toggles between `Eye` and `EyeOff` lucide icons
- Copy button shows a small "Copied ✓" tooltip for 2 seconds

---

### 3.7 Logs Page

```
┌──────────────────────────────────────────────────────────────────┐
│  Logs                                                             │
│                                                                    │
│  TABS:  [ Session ]  [ Errors ● 2 ]  [ System ]  [ RF ]          │
│                       ^^^ red dot badge                            │
│                                                                    │
│  FILTER BAR                                                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Level: [All ▾]  Channel: [All ▾]  Search: [___________]   │  │
│  │                                                              │  │
│  │  [ 📋 Export AI Bundle ]  [ ⏸ Pause ]  [ 🔝 Scroll to Top ] │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  LOG FEED  (virtualized, color-coded)                              │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  21:48:22  INFO   session.ended     48m | 12 nets | 2 creds │  │
│  │  21:35:01  INFO   portal.cred       10.0.0.2 → valid ✓     │  │
│  │  21:22:11  WARN   portal.timeout    aircrack-ng > 10s       │  │
│  │            HINT   ► Handshake may be corrupt. Verify with:  │  │
│  │                     aircrack-ng /var/lib/wcarck/captures/... │  │
│  │  21:15:32  ERROR  adapter.gone      wlan_mon disconnected   │  │
│  │            HINT   ► Replug USB adapter. Check: lsusb |      │  │
│  │                     grep Ralink. Jobs 2,3 auto-cancelled.   │  │
│  │  21:05:44  INFO   capture.valid     NASA — 4-EAPOL ✓       │  │
│  │  21:05:33  INFO   deauth.burst      64 frames → NASA       │  │
│  │  21:05:00  INFO   deauth.started    NASA → AA:BB:CC:DD     │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  Row colors:                                                       │
│    INFO  = default text on default background                      │
│    WARN  = amber text on very subtle amber background              │
│    ERROR = red text on very subtle red background                  │
│    HINT  = indented, dimmer text, with a ► marker                  │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

**Error rows expand on click** to show the full JSON detail in a dark code block
with syntax highlighting (JSON, JetBrains Mono font).

**"Export AI Bundle" button:**
Downloads the `.txt` bundle designed for pasting into an AI assistant (from the
logging design doc). One click → file downloads immediately.

---

### 3.8 Adapters Page

```
┌──────────────────────────────────────────────────────────────────┐
│  Adapters                                                         │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  ┌────────────────────────────────────────────────────────┐  │  │
│  │  │                   wlan_uplink                  LOCKED  │  │  │
│  │  │  ─────────────────────────────────────────────────────  │  │  │
│  │  │  Chipset: MediaTek MT7902                              │  │  │
│  │  │  Driver:  mt7921e                                      │  │  │
│  │  │  MAC:     28:D0:43:0A:73:8C                            │  │  │
│  │  │  Mode:    managed                                      │  │  │
│  │  │  Role:    Internet uplink (never reassigned)           │  │  │
│  │  │                                                        │  │  │
│  │  │  🔒 This adapter is reserved for internet access.      │  │  │
│  │  │     Mode switching is disabled.                        │  │  │
│  │  └────────────────────────────────────────────────────────┘  │  │
│  │                                                              │  │
│  │  ┌────────────────────────────────────────────────────────┐  │  │
│  │  │                   wlan_mon                     ONLINE  │  │  │
│  │  │  ─────────────────────────────────────────────────────  │  │  │
│  │  │  Chipset: Ralink RT5370                                │  │  │
│  │  │  Driver:  rt2800usb  │  Band: 2.4 GHz only            │  │  │
│  │  │  MAC:     00:1E:A6:C6:57:44                            │  │  │
│  │  │  Mode:    monitor ●  │  Channel: 6                     │  │  │
│  │  │  Role:    Primary attack card                          │  │  │
│  │  │                                                        │  │  │
│  │  │  RX: 1,247/s   TX: 64/s   Injection: ✓ working        │  │  │
│  │  │                                                        │  │  │
│  │  │  ┌──────────────────────────────────────────────────┐  │  │  │
│  │  │  │  [ Set Managed ]  [ Set Monitor ]  [ Test Inj. ] │  │  │  │
│  │  │  │  Channel: [ 1 ▾]                                  │  │  │  │
│  │  │  └──────────────────────────────────────────────────┘  │  │  │
│  │  └────────────────────────────────────────────────────────┘  │  │
│  │                                                              │  │
│  │  ┌────────────────────────────────────────────────────────┐  │  │
│  │  │                   wlan_ap                      ONLINE  │  │  │
│  │  │  ─────────────────────────────────────────────────────  │  │  │
│  │  │  Chipset: Realtek RTL8821AU                            │  │  │
│  │  │  Driver:  88XXau (DKMS)  │  Band: 2.4 + 5 GHz         │  │  │
│  │  │  MAC:     5C:62:8B:76:5D:E2                            │  │  │
│  │  │  Mode:    managed  │  Channel: —                       │  │  │
│  │  │  Role:    Evil Twin AP + 5 GHz monitor                 │  │  │
│  │  │                                                        │  │  │
│  │  │  RX: 0   TX: 0   Injection: not tested                │  │  │
│  │  │                                                        │  │  │
│  │  │  ┌──────────────────────────────────────────────────┐  │  │  │
│  │  │  │  [ Set Managed ]  [ Set Monitor ]  [ Set AP ]    │  │  │  │
│  │  │  │  Channel: [ 36 ▾]  (5 GHz non-DFS only)          │  │  │  │
│  │  │  └──────────────────────────────────────────────────┘  │  │  │
│  │  └────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

**Mode switch interaction:**
1. User clicks "Set Monitor" on wlan_mon
2. Button enters loading state (spinner replaces icon, text → "Switching...")
3. Adapter card's mode badge changes to amber "transitioning..." with shimmer
4. Progress events come via WebSocket (updating a progress bar inside the card)
5. On success: badge snaps to green "monitor ●" with a brief glow animation
6. On failure: badge shakes (shake animation) and turns red. Error shown inline
   in the card with the `hint` text.

**Adapter card states:**
| State | Border | Badge | Glow |
|---|---|---|---|
| Online + idle | `--border-subtle` | Gray "managed" | None |
| Online + monitor | `--status-running` border-left | Green "monitor ●" | Subtle green glow |
| Online + AP mode | `--rf-band-5` border-left | Purple "AP ●" | Subtle purple glow |
| Transitioning | `--status-warning` border-left | Amber shimmer | None |
| Error / gone | `--status-error` border-left | Red "error" | Red glow |
| Locked (uplink) | `--border-subtle` | Gray "LOCKED" | None |

---

## 4. Micro-Interactions & Feedback

### 4.1 Toast Notifications

Position: top-right, stacked downward. Auto-dismiss after 4 seconds.

```
┌──────────────────────────────────────┐
│  ✓  Handshake captured — NASA       │    ← success toast (green left border)
│     4-EAPOL • 2.4 MB                │
│                              [ × ]  │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│  ⚠  Adapter wlan_mon disconnected   │    ← error toast (red left border)
│     Jobs 2,3 cancelled              │
│     [ View Details ]         [ × ]  │
└──────────────────────────────────────┘
```

- Enter animation: slide in from right + fade (200ms, ease-out)
- Exit animation: slide right + fade (150ms, ease-in)
- Max 3 visible at once; excess queue behind the stack
- Error toasts stay until dismissed (no auto-dismiss)
- Click "View Details" → navigates to the Logs page with the error pre-selected

### 4.2 Confirmation Modals

Any destructive or irreversible action shows a modal. Two types:

**Type 1: Simple confirmation (e.g., Stop a job)**
```
┌──────────────────────────────────────────────┐
│                                                │
│  Stop deauth job?                              │
│                                                │
│  This will stop deauthentication of NASA      │
│  and release the wlan_mon adapter.            │
│                                                │
│           [ Cancel ]    [ Stop Job ]           │
│                                                │
└──────────────────────────────────────────────┘
```

**Type 2: Full confirmation (e.g., Launch Evil Twin)**
```
┌──────────────────────────────────────────────────┐
│                                                    │
│  Launch Evil Twin?                                 │
│                                                    │
│  ┌──────────────────────────────────────────────┐ │
│  │  SSID:     NASA                               │ │
│  │  Channel:  1 (2.4 GHz)                        │ │
│  │  Adapter:  wlan_ap                            │ │
│  │  Template: Router Update                      │ │
│  │                                                │ │
│  │  ⚠ 5 GHz monitoring will be unavailable.     │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│     [ Cancel ]               [ 🚀 Launch ]        │
│                                                    │
└──────────────────────────────────────────────────┘
```

Modal backdrop: `--bg-root` at 60% opacity. Blur the content behind (8px).
Modal appears with scale + fade: `scale(0.95) → scale(1)` over 200ms.

### 4.3 Tooltips

Every technical term has a tooltip. Implementation:

```typescript
function Tooltip({ children, content }: { children: ReactNode; content: string }) {
  // Use Radix UI tooltip (via shadcn) for consistent positioning
  return (
    <TooltipProvider delayDuration={300}>
      <TooltipRoot>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent className="max-w-[280px] text-sm leading-relaxed">
          {content}
        </TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  )
}
```

Terms that MUST have tooltips:
| Term | Tooltip |
|---|---|
| BSSID | The unique MAC address of the access point (Wi-Fi router). |
| SSID | The network name that appears when you search for WiFi. |
| Channel | The radio frequency channel the AP operates on. 2.4 GHz uses channels 1-13. |
| WPA2-PSK | WiFi encryption using a shared password. The most common home WiFi security. |
| WPA3-SAE | Newer, stronger WiFi encryption. Harder to crack than WPA2. |
| PMF | Protection against deauth attacks. If enabled, our deauth frames may be ignored. |
| EAPOL | The 4-message handshake used when a device connects to a WiFi network. |
| PMKID | A hash from the access point that can be captured without any connected clients. |
| Deauth | Sends fake "disconnect" frames to force clients off the network. |
| Monitor mode | A special adapter mode that lets us see all WiFi traffic in range. |
| Evil Twin | A fake WiFi network that looks identical to the target network. |
| Handshake | The encrypted exchange when a device joins WiFi. Can be cracked offline. |
| dBm | Signal strength. -30 is very strong. -80 is very weak. |

### 4.4 Empty States

Every page that can be empty has a purposeful empty state:

```
┌──────────────────────────────────────────────────────────────┐
│                                                                │
│                     [Relevant icon, 48px, --text-tertiary]    │
│                                                                │
│                 [One-line description of what goes here]       │
│            [One-line instruction on how to populate this]      │
│                                                                │
│                  [ Primary Action Button ]                     │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

Examples:
| Page | Icon | Text | Button |
|---|---|---|---|
| Recon (no scan) | `Radar` | "No networks found yet." / "Start a scan to discover nearby WiFi networks." | "Start Scan" |
| Captures (empty) | `FileDown` | "No handshakes captured." / "Run a deauth attack on a target to trigger a handshake." | "Go to Recon" |
| Credentials (empty) | `KeyRound` | "No credentials captured." / "Launch an Evil Twin with a captive portal to harvest passwords." | "Go to Evil Twin" |
| Attacks (no active) | `Zap` | "No active attacks." / "Select a target from Recon to start an attack." | "Go to Recon" |

### 4.5 Error States — Inline, Not Modal

When a background operation fails, DON'T pop a modal. Show the error INLINE
in the component where the failure occurred:

```
┌────────────────────────────────────────────────────────────┐
│  wlan_mon                                           ERROR  │
│  ─────────────────────────────────────────────────────────  │
│                                                            │
│  ⚠ Failed to set monitor mode                             │
│                                                            │
│  The rt2800usb driver returned "Operation not permitted".  │
│  This usually happens after a USB power event.             │
│                                                            │
│  Try:                                                      │
│  • Unplug and replug the adapter                          │
│  • Click "Retry" below                                    │
│                                                            │
│  [ Retry ]  [ View Log ]                                  │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

The error text comes directly from the `hint` field in the structured log.
"View Log" jumps to the Logs page filtered to this error's `trace_id`.

---

## 5. Guided Workflows — Naive User Paths

### 5.1 First Launch — Welcome Screen

On first launch (no sessions exist), show a welcome overlay:

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                    │
│                                                                    │
│                   [W]  Wcarck                                      │
│                                                                    │
│           Portable WiFi Audit Platform                             │
│                                                                    │
│  ─────────────────────────────────────────────────────────────── │
│                                                                    │
│  Let's verify your setup before we begin.                         │
│                                                                    │
│  Adapters detected:                                                │
│    ✓  wlan_uplink  (MT7902)     — internet connection active      │
│    ✓  wlan_mon     (RT5370)     — ready for monitor mode          │
│    ✓  wlan_ap      (RTL8821AU)  — ready for AP mode              │
│                                                                    │
│  All 3 adapters detected. You're ready to go.                     │
│                                                                    │
│                   [ Start First Scan → ]                           │
│                                                                    │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

If an adapter is missing:
```
│    ✓  wlan_uplink  (MT7902)     — internet connection active      │
│    ✗  wlan_mon     (not found)  — plug in your Ralink adapter    │
│    ✓  wlan_ap      (RTL8821AU)  — ready for AP mode              │
│                                                                    │
│  ⚠ 1 adapter missing. Plug it in and click "Refresh".            │
│                                                                    │
│          [ Refresh ]          [ Continue Anyway → ]               │
```

### 5.2 Context-Aware Action Suggestions

Throughout the UI, context-sensitive "next step" suggestions appear:

**After scan finds networks:**
```
┌──────────────────────────────────────────────────────┐
│  💡 12 networks found. Click a network to see its    │
│     details and available attack options.             │
│                                                [×]   │
└──────────────────────────────────────────────────────┘
```

**After handshake captured:**
```
┌──────────────────────────────────────────────────────┐
│  ✓ Handshake captured for NASA. You can now:         │
│    • Download the .22000 file for offline cracking   │
│    • Launch an Evil Twin to capture the password     │
│    • Send to Wcarck's built-in cracker              │
│                                                [×]   │
└──────────────────────────────────────────────────────┘
```

These are dismissable (×) and don't appear again for the same event type
in the same session (tracked via localStorage).

---

## 6. Performance Specifications

### 6.1 Render Budget

| Metric | Target | How |
|---|---|---|
| First Contentful Paint | < 800ms | Code-split pages, preload critical CSS |
| Time to Interactive | < 1.5s | Lazy-load non-critical pages |
| WS event → UI update | < 50ms | Zustand direct update, no React context cascade |
| Table re-render (50 rows) | < 16ms (60fps) | Virtualized rows, Record<bssid, Network> store |
| Animation frame budget | 16ms | CSS transitions for all animations (GPU-accelerated) |
| Page navigation | < 100ms | React.lazy + Suspense with fade transition |
| Bundle size (gzipped) | < 200 KB | Tree-shake, no heavy charting libraries |

### 6.2 Data Update Strategy

| Source | Update frequency | Render strategy |
|---|---|---|
| Scan networks | Every ~2s (CSV flush) | Merge into Record by BSSID; only changed BSSIDs trigger row re-render |
| Signal strength | Every ~2s | Update in-place; signal bars use CSS `transition` (no re-render) |
| Deauth counter | Every burst (~100ms) | `requestAnimationFrame` throttle; display updates at most 10x/sec |
| Credential feed | On event (rare) | Prepend to list; new row animates in |
| Adapter status | On event (rare) | Direct Zustand update; adapter card re-renders |
| Job state | On transition | Direct Zustand update; job card re-renders |

### 6.3 Table Virtualization

All tables with > 20 rows use `@tanstack/react-virtual`:

```typescript
const rowVirtualizer = useVirtualizer({
  count: networks.length,
  getScrollElement: () => tableContainerRef.current,
  estimateSize: () => 48,    // row height in px
  overscan: 5,               // render 5 extra rows above/below viewport
})
```

This means a 200-network scan table renders only ~20 DOM nodes at a time
instead of 200. Scroll performance stays at 60fps regardless of network count.

---

## 7. Design Review — Self-Corrections

After writing the full design above, I reviewed it from the perspective of
three users: a naive first-timer, an experienced pentester, and a developer.

### Correction 1: Sidebar should NOT auto-expand on hover — too jittery

**Problem:** Auto-expand on hover causes the sidebar to flicker when the user
moves the mouse across the left edge of the screen (common when reaching for
the browser back button). The content zone width changing constantly is jarring.

**Fix:** The sidebar is icon-only (64px) by default. A small pin button (📌)
at the top of the sidebar toggles it between collapsed (64px) and expanded
(220px). The state is persisted in localStorage. The sidebar never auto-expands.

### Correction 2: Deauth confirmation modal is unnecessary friction

**Problem:** Requiring a modal confirmation for deauth adds a click to the
most common attack workflow. Experienced pentesters will find this annoying.

**Fix:** Deauth from the network detail panel starts immediately on click
(no confirmation). The "Stop" button is prominently visible. Only the Evil Twin
(which requires adapter mode switch and is harder to undo) gets a confirmation
modal.

### Correction 3: The Recon page detail panel should be persistent

**Problem:** If the user clicks a different network, the panel cross-fades.
But if they accidentally click the same network, the panel closes (toggle
behavior). This is confusing — the user wanted to look at the network, not
close the panel.

**Fix:** Clicking a network ALWAYS opens or updates the panel. Only the explicit
"×" button or the `Escape` key closes it. Clicking outside the panel (on the
table) selects a different network but doesn't close the panel.

### Correction 4: The "Guided Action Bar" should disappear faster

**Problem:** The big banner "Ready to start. Click Start Scan" takes up
vertical space that experienced users don't need after the first session.

**Fix:** The guided action bar appears only when:
1. No session has ever been run (true first launch), OR
2. No active jobs AND no session started in the last 24 hours

After the user starts their first scan, it never appears again (tracked in
localStorage). An experienced user sees the dashboard metrics immediately.

### Correction 5: Signal strength should use numbers, not just bars

**Problem:** The 4-bar visualization is ambiguous. Pentesters need exact dBm
values to assess attack feasibility (deauth below -75 dBm is unreliable).

**Fix:** Show BOTH the bars AND the number. The bars provide quick visual
scanning; the number provides precision:

```
████  -47    ← strong, green bars, number visible
██    -71    ← weak, amber bars, number visible
█     -82    ← very weak, red bar, number visible
```

### Correction 6: Mode switch should show progress steps

**Problem:** The mode switch from managed → monitor is described as "spinner
replaces icon" but doesn't tell the user what's actually happening.

**Fix:** Show a mini step indicator inside the adapter card during transitions:

```
┌──────────────────────────────────────────────────┐
│  wlan_mon                          Switching...  │
│                                                  │
│  ① Bringing interface down...           ✓       │
│  ② Setting monitor mode...              ●       │
│  ③ Bringing interface up...             ◌       │
│  ④ Verifying injection...               ◌       │
│                                                  │
│  ██████████████░░░░░░░░░░  50%                  │
└──────────────────────────────────────────────────┘
```

### Correction 7: The "Copy for AI" button needs a better label

**Problem:** "Export AI Bundle" is confusing for a naive user who doesn't know
what an AI bundle is.

**Fix:** Label it: **"📋 Copy Debug Report"** — then add a subtitle:
"Generates a structured report you can paste into ChatGPT, Claude, or any AI
for instant troubleshooting."

### Correction 8: Channel selector for wlan_ap needs DFS warnings

**Problem:** The channel dropdown for `wlan_ap` shows all 5 GHz channels
without indicating which ones will fail due to DFS restrictions.

**Fix:**
```
Channel: [ 36  ▾]
  36  (5180 MHz)
  40  (5200 MHz)
  44  (5220 MHz)
  48  (5240 MHz)
  ── DFS channels (may require 60s wait) ──
  52  ⚠ DFS
  56  ⚠ DFS
  ...
  149 (5745 MHz)
  153 (5765 MHz)
  157 (5785 MHz) — same as NASA+
  161 (5805 MHz)
  165 (5825 MHz)
```

DFS channels are visually separated and marked with ⚠. Selecting a DFS channel
shows an inline warning: "This channel requires a 60-second radar scan before
use. AP startup will be delayed."

---

## 8. Accessibility

### 8.1 Keyboard Navigation

| Key | Action |
|---|---|
| `Tab` | Move focus between interactive elements |
| `Enter` / `Space` | Activate focused button or link |
| `Escape` | Close modal, close detail panel, cancel current action |
| `Ctrl+K` | Open command palette (fuzzy search all actions) |
| `1`–`9` | Quick navigate to sidebar items (Dashboard=1, Recon=2, ...) |
| `↑` / `↓` | Navigate table rows |
| `Enter` on table row | Open detail panel for that row |

### 8.2 Command Palette

`Ctrl+K` opens a command palette (like VS Code):

```
┌──────────────────────────────────────────────────────┐
│  🔍 Type a command...                                 │
│  ──────────────────────────────────────────────────── │
│  ▶ Start Scan                              Ctrl+S    │
│  ■ Stop All Jobs                           Ctrl+.    │
│  ⚡ Deauth...                                         │
│  👻 Launch Evil Twin...                               │
│  📥 Export Captures                                   │
│  📋 Copy Debug Report                                 │
│  ⚙ Settings                                          │
└──────────────────────────────────────────────────────┘
```

Fuzzy match on keystrokes. Top result always highlighted. Enter executes.

### 8.3 Color Contrast

All text meets WCAG AA contrast ratio (4.5:1 for normal text, 3:1 for large text).
Critical status colors (error red, success green) are distinguishable even for
deuteranopia (red-green color blindness) — aided by shape indicators (✓, ✗, ●, ◌)
that don't rely solely on color.

---

## 9. Design Token CSS File — Complete

This is the actual `index.css` file to start with:

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  /* All tokens from Section 1 above */
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: var(--leading-normal);
  color: var(--text-primary);
  background: var(--bg-root);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Scrollbar styling (Ubuntu-like thin scrollbar) */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: hsl(225, 10%, 25%);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover { background: hsl(225, 10%, 35%); }

/* Selection color */
::selection {
  background: hsl(18, 90%, 56%, 0.3);
  color: var(--text-primary);
}

/* Focus ring — Ubuntu orange, visible but not intrusive */
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

/* Mono class for technical text */
.mono {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  letter-spacing: -0.01em;
}

/* Utility: glass panel effect */
.glass {
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  border: 1px solid var(--glass-border);
}
```

---

*End of Wcarck UI/UX Design Specification v1.0*
