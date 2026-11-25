# Current status and known issues

The packaged Core user service is enabled and the redesigned Cinnamon
applet is installed. The original software and saved pairings are
available for rollback. The Core uses the pinned upstream notification
timing and binds to IPv4 loopback. See [architecture](architecture.md),
[verification](verification.md).

- Manual and automatic reconnection can leave BlueZ and Core reporting
  connected while raw GetAll lacks battery and wear capabilities. Capture
  review showed AAP settings packets without corresponding battery or
  wear packets in a failing session. The notification mask remains a
  hypothesis. The lab's 900 ms delay remains unverified. Reconnection
  work and Spatial Audio are deferred.
- A missing case reading can come from Core's disconnected status and
  zero placeholder. The redesigned card remains visible where supported
  and shows a validated cached reading or Unavailable. Fresh data
  through every lid transition remains unverified.
- The Bluetooth name is Powerbeats Pro. The reported product ID
  `0x201d` maps to Powerbeats Pro 2 in the pinned Core. The physical
  generation still requires independent confirmation.
- The preview's automatic pause and resume switch was observed OFF.
  Its value comes from Core. A fresh installation inherits upstream
  defaults, which can enable pause and resume. Persistence across
  reconnection and behavior with missing wear telemetry need live checks.
- A Cinnamon reload incident coincided with a missing Core listener.
  Manual relaunch restored it. The recorded logs did not establish the
  process exit cause. The candidate adds a user service with bounded
  recovery. Live crash recovery passed. Login after a full logout and the
  packaged binary's headphone behavior remain pending.
- Local WebSocket access remains unauthenticated. See
  [the threat and service model](architecture.md#process-management-and-security).

## Sanitized diagnostic findings

Two earlier AAP startups both sent init, EF and FF, with roughly 300 ms
between requests. The failed sequence received opcode 002B 108 ms
after FF and received settings and firmware, with battery 0004 and
wear 0006 absent. The successful sequence received 002B 134 ms before
FF, battery 127 ms after FF and wear 285 ms after FF. A case reopen
restored telemetry during the successful trial. The meaning of 002B
and causality remain unverified. The regression predates phone pairing.

The large later capture recorded one experimental startup using a
900 ms EF-to-FF interval. Battery and wear arrived before FF. All 33
battery frames examined in that session had a disconnected case with a
zero placeholder. A Transparency request had a matching reply. The
smaller logs did not establish a crash or OOM during the earlier
backend disappearance. The earlier AAP-focused evidence remains private.

