#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-only
set -eu
package=$(CDPATH='' cd -- "${1:?Pass the extracted runtime package directory}" && pwd)
test_root=$(mktemp -d)
trap 'rm -rf -- "$test_root"' EXIT
export HOME="$test_root/home" XDG_DATA_HOME="$test_root/data" XDG_CONFIG_HOME="$test_root/config"
export MAGIC_TEST_CALLS="$test_root/systemctl-calls" MAGIC_TEST_LISTENER=''
mkdir -p "$HOME" "$test_root/bin"
export PATH="$test_root/bin:$PATH"
cat > "$test_root/bin/systemctl" <<'STUB'
#!/bin/sh
[ "$1" = --user ] || exit 2
printf '%s\n' "$*" >> "$MAGIC_TEST_CALLS"
STUB
cat > "$test_root/bin/ss" <<'STUB'
#!/bin/sh
[ -z "$MAGIC_TEST_LISTENER" ] || printf '%s\n' "$MAGIC_TEST_LISTENER"
STUB
cat > "$test_root/bin/pgrep" <<'STUB'
#!/bin/sh
exit 1
STUB
chmod +x "$test_root/bin/"*
applet="$XDG_DATA_HOME/cinnamon/applets/magicpods-cinnamon@local"
unit="$XDG_CONFIG_HOME/systemd/user/magicpods-cinnamon.service"
backend="$HOME/.local/share/magicpods-cinnamon/backend"
state="$HOME/.local/state/magicpods-cinnamon/magicpods"
checker="$package/service/check-backend"

"$package/install.sh" --applet-only
test -f "$applet/stylesheet.css"
test ! -e "$unit"
test ! -e "$backend"
"$package/uninstall.sh"
test ! -e "$applet"
test ! -e "$MAGIC_TEST_CALLS"

MAGIC_TEST_LISTENER='LISTEN 0 128 0.0.0.0:2020 0.0.0.0:* users:(("core",pid=21,fd=4))'
if "$package/install.sh" || "$checker" listener 21; then
    echo 'Unexpected acceptance of a busy/wildcard socket' >&2
    exit 1
fi
test ! -e "$applet"
MAGIC_TEST_LISTENER='LISTEN 0 128 127.0.0.1:2020 0.0.0.0:* users:(("core",pid=21,fd=4))'
"$checker" listener 21
if "$checker" listener 22; then
    echo 'Unexpected acceptance of incorrect listener owner' >&2
    exit 1
fi
MAGIC_TEST_LISTENER=''

"$package/install.sh"
test -x "$backend/magicpodscore"
test -f "$unit"
cmp "$package/backend/magicpodscore" "$backend/magicpodscore"
test "$(stat -c %a "$backend")" = 700
test "$(stat -c %a "$state")" = 700
grep -Fx -- '--user enable --now magicpods-cinnamon.service' "$MAGIC_TEST_CALLS"
printf '%s\n' retained > "$state/test-preference"
"$package/uninstall.sh"
test ! -e "$unit"
test ! -e "$applet"
test ! -e "$backend/magicpodscore"
test "$(cat "$state/test-preference")" = retained
grep -Fx -- '--user disable --now magicpods-cinnamon.service' "$MAGIC_TEST_CALLS"
printf '%s\n' 'PASS isolated preview/managed installation, listener checks, user-service calls and uninstall'
