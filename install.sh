#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-only
set -eu
umask 077
root=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
uuid=magicpods-cinnamon@local
unit=magicpods-cinnamon.service
applet="${XDG_DATA_HOME:-$HOME/.local/share}/cinnamon/applets/$uuid"
support="$HOME/.local/share/magicpods-cinnamon"
units="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
state="$HOME/.local/state/magicpods-cinnamon"

if [ "$(id -u)" -eq 0 ]; then
    echo 'Run this installer as the Cinnamon desktop user.' >&2
    exit 1
fi
case "${1:-}" in
    ""|--applet-only) ;;
    *) echo 'Usage: ./install.sh [--applet-only]' >&2; exit 2 ;;
esac
cjs -c 'imports.gi.versions.Soup = "3.0"; void imports.gi.Soup.Session;'
if [ "${1:-}" != --applet-only ]; then
    if [ ! -x "$root/backend/magicpodscore" ] || [ ! -f "$root/backend/magicpodscore.sha256" ]; then
        echo 'Managed installation requires the runtime archive with its bundled Core. Use --applet-only for preview.' >&2
        exit 1
    fi
    "$root/service/check-backend" preflight "$root/backend"
    dependencies=$(ldd "$root/backend/magicpodscore")
    if printf '%s\n' "$dependencies" | grep -q 'not found'; then
        printf '%s\n' "$dependencies" | grep 'not found' >&2
        exit 1
    fi
    systemctl --user show-environment >/dev/null
fi

install -d -m 700 "$applet"
install -m 600 "$root/applet/applet.js" "$root/applet/metadata.json" \
    "$root/applet/settings-schema.json" "$root/applet/stylesheet.css" "$applet/"
if [ "${1:-}" = --applet-only ]; then
    printf '%s\n' 'Add MagicPods in Cinnamon System Settings under Applets.'
    exit 0
fi

install -d -m 700 "$support" "$support/backend" "$state" "$state/magicpods"
mkdir -p -- "$units"
install -m 700 "$root/backend/magicpodscore" "$support/backend/"
install -m 600 "$root/backend/magicpodscore.sha256" "$support/backend/"
install -m 700 "$root/service/check-backend" "$support/"
install -m 600 "$root/service/$unit" "$units/"
systemctl --user daemon-reload
systemctl --user enable --now "$unit"
printf '%s\n' 'Add MagicPods in Cinnamon System Settings under Applets.'
