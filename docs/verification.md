# Verification

## Controlled frontend benchmark

Mint 22.3, Cinnamon 6.6.9, CJS 115.2. One existing experimental Core
served all profiles over loopback. Qt was launched with its fallback
backend path disabled. The desktop session and Blueman stayed running.
The applet files and panel layout were restored at the end. Each profile
settled for five seconds and was sampled for 30 seconds. Active means the
Qt window or Cinnamon menu was open, with no scripted hardware activity.

Process memory is shown as **PSS / RSS in KiB**. CPU is the percentage of
one logical CPU over the sample. Cinnamon figures include the entire
desktop shell.

| Profile | Cinnamon PSS / RSS | Core PSS / RSS | Qt PSS / RSS | CPU Cinnamon / Core / Qt |
| --- | ---: | ---: | ---: | ---: |
| Shell without frontend | 168554 / 240312 | 12907 / 27860 | — | 24.67 / 0.77 / — |
| Qt background | 161787 / 240380 | 12809 / 27860 | 159622 / 218388 | 27.13 / 0.97 / 0.10 |
| Qt visible | 165525 / 244524 | 12809 / 27860 | 173963 / 236068 | 24.00 / 0.80 / 0.20 |
| Previous Cinnamon, closed | 172850 / 244604 | 12909 / 27860 | — | 22.03 / 0.73 / — |
| Previous Cinnamon, open | 172922 / 244676 | 12969 / 27920 | — | 19.87 / 1.07 / — |
| Redesigned Cinnamon, closed | 172850 / 244604 | 12957 / 27908 | — | 19.73 / 1.13 / — |
| Redesigned Cinnamon, open | 172779 / 244632 | 12922 / 27908 | — | 20.37 / 1.10 / — |

The closed-menu shell PSS increment was 4.20 MiB for both applets in this
run. The redesigned open menu measured 143 KiB less PSS and 44 KiB less
RSS than the previous menu. The difference is too small to establish a
memory improvement. The current closed-menu shell PSS delta plus Core
PSS was 16.85 MiB. Shell activity varied across profiles, so the samples
cannot attribute CPU to a menu or distinguish small changes. The user's
earlier 6.86 MiB incremental shell and 12.71 MiB Core PSS remain
separate observations. The original 247.8 MiB Qt figure was RSS.

TCP sent and received byte counters rose by 24–32 bytes per native profile in
30 seconds, 32 bytes in Qt background and 1,782 in Qt visible. These are
steady-state socket counters, including keepalive traffic, and exclude
initial snapshots and hardware interaction. Qt added one user process.
Cinnamon added none. Both had one Core. Blueman applet, tray and manager
remained present in all frontend samples. The benchmark counted desktop
user processes, so system BlueZ is outside those counts.

Previous applet source payload was 12,825 bytes (24 KiB allocated on this
filesystem). Redesigned payload is 24,132 bytes (40 KiB allocated), with
1,505 bytes of CSS and theme-provided icons. Qt used 82.86 MiB for the
original installation, including its Core, plus 175.65 MiB for the
separate Qt runtime. The experimental Core binary was 2,293,760 allocated
bytes (2.19 MiB). The original frontend links Qt 6 Quick Controls, Widgets, WebSockets,
QML, GUI, D-Bus, Network and Core, along with OpenGL/GLX. Both native
versions use the existing CJS shell and Soup 3. Neither adds a GUI
toolkit or process.

## Hardware evidence from preview

| Test | Evidence |
| --- | --- |
| Connection, both earbuds audible, pause on removal and resume on reinsertion | User confirmed. Core connection/wear events, PipeWire routing and Firefox MPRIS calls corroborated the sequence. |
| Applet menu with left, right and case percentages | User confirmed. Core snapshots also contained all three components. |
| Charging transitions and case readings | Automatically observed in Core, including live case and earbud charging without Blueman. |
| Connect and Disconnect menu actions | User confirmed and Core events matched. Battery returned on one trial and was absent after later reconnects. |
| Closed case then automatic reconnect without Blueman | User confirmed connection. Core reported fresh earbud percentages on one trial. Later automatic reconnect reproduced missing telemetry. |
| Listening modes | All three native rows were activated on the live preview with backend selection and radio state verified. The starting mode was restored. Physical-control changes and other headsets remain unverified. |
| Blueman closed | Two desktop processes stopped temporarily. BlueZ retained pairing and routed audio. A temporary BlueZ agent paired a separate device. Headphone pairing was preserved. Blueman was restored. |

In one matched 60-second suspended-sink trial the Blueman processes
accounted for 46.78 MiB PSS and 14.05% of one logical CPU. Bluetooth
background processes in scope fell from four to two. Core changed from
13.64 to 13.68 MiB PSS and 1.25% to 1.38% CPU. Cinnamon changed from
147.94 to 149.63 MiB PSS. BlueZ PSS was unavailable to the desktop user.
Earlier user baselines were 30.40 MiB Blueman applet PSS, 19.50 MiB tray
PSS, 2.89 MiB BlueZ PSS and 13.01 MiB Core PSS. Package metadata showed
3.81 MiB for Blueman and 4.35 MiB for BlueZ.

## Release candidate acceptance

The offline JavaScript fixture exercises stable rows, battery validity
and cache isolation, mode masks, read-only/unknown modes, preservation
of unrelated wear settings and Connect/Disconnect payloads.
Run `node tests/applet-fixture.cjs` from the checkout.

The installer test uses an isolated home and stubbed user systemd and
socket discovery. It checks preview and managed file layouts, service
enable/disable calls, wildcard and process-owner rejection, private
directory modes, and preference preservation on uninstall.

```sh
tests/install-package.sh /path/to/extracted/magicpods-cinnamon
```

The live packaged service passed startup, exclusive loopback PID checks,
normal stop and port release through uninstall, reinstall, and automatic
recovery after SIGKILL. Cinnamon reconnected to the replacement process.
The loopback WebSocket returned a GetAll headphone-list snapshot.
The process ran from the bundled installed executable. Its post-recovery
sample was 12,984 KiB PSS and 27,900 KiB RSS.

Manual acceptance remains open for full logout/login and for headset
playback, case charging and fresh readings, wear and pause/resume,
physical listening-mode changes, and telemetry after manual and
case-based reconnect. Preview tests above describe earlier results.

Raw 30-second samples are in `tests/benchmark/frontend.jsonl`.
The recipe is `python3 tests/benchmark/measure-frontends.py` from the
checkout. It requires the original Qt frontend, one existing Core and
an enabled applet. It temporarily switches applet files and desktop
panel state and restores them at the end. Preserve the current session
before any repeat. The socket byte deltas are in sent/received order.
RAM is an endpoint snapshot and CPU uses process tick deltas.

Combined PSS in KiB (frontend increment or separate Qt process, plus
Core) was 172431 idle / 186772 open for Qt, 17205 / 17337 for previous
Cinnamon, and 17253 / 17147 for redesigned Cinnamon. Corresponding
RSS arithmetic gives 246248 / 263928, 32152 / 32284 and 32200 / 32228
KiB. RSS sums can count shared pages multiple times. Cinnamon applet
RSS and PSS are shell-baseline deltas, so incidental shell allocation
and frontend process sharing limit their precision.

The release Core reported version 2.0.12. Two clean offline builds in
different paths produced the same Core SHA-256 with the host toolchain.
ELF inspection found system library dependencies and no private library
search path. The unit passed `systemd-analyze verify` with staged paths.
The release does not install this project's dev tests. Upstream Core's
debug-only test entry points are disabled in its Release configuration.

The final runtime archive was 893,835 bytes, and its full extracted
file tree occupied 2,482,176 bytes on the test filesystem. The matching
source archive was 10,161,537 bytes. Both archives passed their checksum
checks. The final runtime archive passed the isolated installer test
after extraction.

The installed applet occupies 40,960 allocated bytes, installed backend
and verifier 2,310,144 bytes, and the user unit file 4,096 bytes. These
total 2,355,200 bytes excluding generated state, rollback files and
system-provided dependencies. The retained Core source reference is
3,563,520 bytes. Lab source is 3,575,808 bytes, the saved baseline and
dependency sources 32,452,608 bytes, and the lab experimental binary
directory 2,297,856 bytes. The release outputs occupy 11,067,392
allocated bytes. The original Qt program and separate Qt runtime use
271,073,280 bytes together and remain available for rollback.

A separate 15-second sample after managed installation measured Core
at 13,629 KiB PSS, 28,608 KiB RSS and 1.53% of one logical CPU. The
service was active and enabled with one loopback listener, one Core
and zero Qt frontend processes. This short live-desktop observation
is separate from the matched frontend benchmark.
