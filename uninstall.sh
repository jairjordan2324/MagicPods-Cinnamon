#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-only
set -eu
uuid=magicpods-cinnamon@local
unit=magicpods-cinnamon.service
data="${XDG_DATA_HOME:-$HOME/.local/share}"
applet="$data/cinnamon/applets/$uuid"
support="$HOME/.local/share/magicpods-cinnamon"
units="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"

if [ "$(id -u)" -eq 0 ]; then
    echo 'Run this uninstaller as the Cinnamon desktop user.' >&2
    exit 1
fi
if [ -f "$units/$unit" ]; then
    systemctl --user disable --now "$unit"
    rm -f -- "$units/$unit"
    systemctl --user daemon-reload
fi
rm -f -- "$support/check-backend" "$applet/applet.js" "$applet/metadata.json" "$applet/settings-schema.json" "$applet/stylesheet.css"
rm -f -- "$support/backend/magicpodscore" "$support/backend/magicpodscore.sha256"
for directory in "$applet" "$support/backend" "$support"; do
    if [ -d "$directory" ]; then
        rmdir --ignore-fail-on-non-empty -- "$directory"
    fi
done
printf '%s\n' 'Original installations and application preferences are retained.'
