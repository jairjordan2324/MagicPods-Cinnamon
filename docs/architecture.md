# Architecture

The Cinnamon applet runs inside the shell's CJS process. Native St and
PopupMenu actors supply the menu, settings, accessibility and notifications.
System Soup 3 connects to MagicPodsCore at `ws://127.0.0.1:2020`. Core owns
BlueZ, Apple/Beats protocol handling and MPRIS automation. A separate Blueman
extension would tie the frontend to Blueman's process lifecycle. The
applet works with or without Blueman's desktop processes. BlueZ and the existing audio stack remain in use.
BlueZ's standard battery interface supplies one device-level percentage.
Blueman 2.4.4's plugin loader also lacks a per-user plugin directory,
so an extension would need packaging or upstream changes and would
still need Core for per-earbud telemetry.

The client validates messages and device addresses, requests GetAll on
opening the WebSocket, and consumes subsequent events. Disconnected socket
retries are bounded by backoff. Connected battery updates are event-driven.
The menu updates existing rows on value changes and reconstructs its
structure when the visible capabilities change. Native theme values control
fonts and interaction. A small stylesheet supplies the battery tracks and
spacing. Icons use the system theme.

Battery entries come from Core's connected-device capability. The applet
validates readings, renders charging only for live values, and displays
unavailable case slots for split-earbud reports. A bounded per-device
session cache retains the last valid percentage and labels it Cached.
The separate BLE animation payload is outside this data path. Listening
mode flags are Off 1, Transparency 2 and Noise Cancellation 16. The
applet intersects the flags with Core's supported mask, waits for
reported selection and respects read-only state. The wear switch sends
the changed `pauseMedia` property with the existing volume/speaker values.
Its initial display reflects the backend's stored preference.

## Process management and security

Preview mode attaches to an existing Core. The packaged service starts its
own bundled Core as the desktop user and uses a private configuration
directory. Preflight checks the binary checksum, the port and other
MagicPods processes. After startup it verifies that a single IPv4 loopback
listener belongs to its main PID. Restart delay and a systemd start limit
bound service recovery. Normal Cinnamon reloads do not manage the service.

The WebSocket API has no authentication or per-user peer checks.
Other local accounts or local programs may be able to observe device
information and issue control requests. Browser clients may also be able
to reach the endpoint where browser network policy permits it. Loopback
limits direct network reachability. The checksum detects accidental
changes to the packaged executable. Trust in the archive and accompanying
checksum still depends on how they were obtained.

## Packaging and corresponding source

The packager takes pinned Core source
(`04af4bdeb5cbdc7cb6eeba9b0acf2076cc6d3c16`) and the five FetchContent
source trees from a configuration of that revision. Use the matching
Core and a dependency cache prepared with CMake on the target distro.

```sh
cmake -S upstream/backend -B /tmp/magicpods-core-deps -DCMAKE_BUILD_TYPE=Release
tools/package-release.sh upstream/backend /tmp/magicpods-core-deps/_deps /tmp/magicpods-release
```

It applies the loopback patch, builds offline from bundled dependency
source, and creates an allowlisted runtime archive, corresponding source
and SHA-256 sums. The build uses GNU 13.3 and CMake 3.28 on Mint 22.3.
The private journal, captures, tests, Git history and personal paths are
excluded from release inputs. The release timing is the upstream timing.
For dependencies and standalone build commands, see the [README](../README.md).

MagicPodsCore and the applet are distributed under GPL-3.0. The release
source contains the pinned Core with the patch applied, exact vendor
sources, applet, install/service and build scripts. The runtime carries
upstream notices and license texts for sdbus-c++ (LGPL-2.1 with linking
exception), uSockets and uWebSockets (Apache-2.0), and nlohmann/json and
toml++ (MIT). System shared libraries are supplied by the distribution.
Offer matching source beside the executable at release time. [GNU GPLv3 §6](https://www.gnu.org/licenses/gpl-3.0.html)
