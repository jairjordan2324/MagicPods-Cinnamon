const Applet = imports.ui.applet;
const PopupMenu = imports.ui.popupMenu;
const Main = imports.ui.main;
const Settings = imports.ui.settings;
const RadioButton = imports.ui.radioButton;
const ByteArray = imports.byteArray;
imports.gi.versions.Soup = '3.0';
const {Atk, Clutter, Gio, GLib, Pango, Soup, St} = imports.gi;

const ADDRESS = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i;
const BATTERIES = {
    left: ['Left', 'audio-headphones-symbolic'],
    right: ['Right', 'audio-headphones-symbolic'],
    case: ['Case', 'battery-symbolic'],
    single: ['Battery', 'battery-symbolic'],
};
const BATTERY_BAR_WIDTH = 94;
const WEAR_STATES = ['Unavailable', 'Worn', 'Partially worn', 'Out of ear'];
const LISTENING_MODES = [[1, 'Off'], [2, 'Transparency'], [16, 'Noise Cancellation']];

const MAX_PAYLOAD = 256 * 1024;

function object(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function device(value) {
    return object(value) && typeof value.address === 'string' && ADDRESS.test(value.address) &&
        typeof value.name === 'string' && value.name.length <= 256 &&
        typeof value.connected === 'boolean';
}

function battery(value) {
    return object(value) && (value.status === 2 || value.status === 3) &&
        Number.isInteger(value.battery) && value.battery >= 0 && value.battery <= 100 &&
        typeof value.charging === 'boolean';
}

function listeningModes(anc) {
    return Number.isInteger(anc?.options) && anc.options >= 0 && anc.options <= 255 ?
        LISTENING_MODES.filter(([mode]) => (anc.options & mode) !== 0) : [];
}

function wearSettings(detection) {
    const selected = detection?.selected;
    return object(selected) && typeof selected.pauseMedia === 'boolean' &&
        typeof selected.switchToSpeakers === 'boolean' &&
        Number.isInteger(selected.lowerVolume) && selected.lowerVolume >= 0 &&
        selected.lowerVolume <= 100 ? selected : null;
}

class MagicPodsApplet extends Applet.IconApplet {
    constructor(metadata, orientation, panelHeight, instanceId) {
        super(orientation, panelHeight, instanceId);
        this.setAllowedLayout(Applet.AllowedLayout.BOTH);
        this.set_applet_icon_symbolic_name('audio-headphones-symbolic');
        this.menu = new Applet.AppletPopupMenu(this, orientation);
        this.menuManager = new PopupMenu.PopupMenuManager(this);
        this.menuManager.addMenu(this.menu);
        this.passiveItems = [];
        this.menu.actor.connect('style-changed', () => {
            for (const item of this.passiveItems)
                this.useMenuForeground(item);
        });
        this.low = new Map();
        this.batteryHistory = new Map();
        this.devices = [];
        this.info = null;
        this.adapterEnabled = null;
        this.initialized = false;
        this.retryDelay = 1;
        this.retryId = 0;
        this.handshakeId = 0;
        this.cancellable = new Gio.Cancellable();

        // A simple resolver without a default proxy always connects directly.
        this.session = new Soup.Session({
            proxy_resolver: Gio.SimpleProxyResolver.new(null, null),
            timeout: 8,
        });

        this.settings = new Settings.AppletSettings(this, metadata.uuid, instanceId);
        this.settings.bind('low-alerts', 'lowAlerts', () => this.render());
        this.settings.bind('low-threshold', 'lowThreshold', () => this.render());
        this.render();
        this.connectSocket();
    }

    connectSocket() {
        const message = Soup.Message.new('GET', 'ws://127.0.0.1:2020/');
        message.set_flags(Soup.MessageFlags.NO_REDIRECT);
        this.session.websocket_connect_async(message, null, null, GLib.PRIORITY_DEFAULT,
            this.cancellable, (session, result) => {
                let socket;
                try {
                    socket = session.websocket_connect_finish(result);
                } catch (_) {
                    this.retry();
                    return;
                }

                if (this.cancellable.is_cancelled()) {
                    socket.close(1000, null);
                    return;
                }

                this.socket = socket;
                socket.set_max_incoming_payload_size(MAX_PAYLOAD);

                socket.connect('message', (source, type, bytes) => {
                    if (source === this.socket && type === Soup.WebsocketDataType.TEXT)
                        this.receive(bytes);
                });

                socket.connect('closed', () => {
                    if (this.socket === socket)
                        this.retry();
                });

                this.handshakeId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 8, () => {
                    this.handshakeId = 0;
                    if (this.socket === socket)
                        socket.close(1008, 'API handshake timeout');
                    return GLib.SOURCE_REMOVE;
                });
            });
    }

    retry() {
        if (this.cancellable.is_cancelled() || this.retryId)
            return;

        this.clearHandshake();
        this.socket = null;
        this.initialized = false;
        this.info = null;
        this.devices = [];
        this.adapterEnabled = null;
        this.render();

        this.retryId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, this.retryDelay, () => {
            this.retryId = 0;
            this.connectSocket();
            return GLib.SOURCE_REMOVE;
        });

        this.retryDelay = Math.min(this.retryDelay * 2, 30);
    }

    clearHandshake() {
        if (this.handshakeId) {
            GLib.source_remove(this.handshakeId);
            this.handshakeId = 0;
        }
    }

    send(method, args) {
        if (this.initialized && this.socket?.get_state() === Soup.WebsocketState.OPEN)
            this.socket.send_text(JSON.stringify({method, arguments: args}));
    }

    receive(bytes) {
        if (bytes.get_size() > MAX_PAYLOAD)
            return;

        let message;

        try {
            message = JSON.parse(ByteArray.toString(bytes.get_data()));
        } catch (_) {
            return;
        }

        if (!object(message))
            return;

        if (!this.initialized) {
            if (!object(message.init) || message.init.api !== 1)
                return;

            this.clearHandshake();
            this.initialized = true;
            this.retryDelay = 1;
            this.send('GetAll');
            this.render();
            return;
        }

        if (Array.isArray(message.headphones))
            this.devices = message.headphones.filter(device).slice(0, 64);

        if (object(message.info)) {
            if (device(message.info))
                this.info = message.info;
            else if (!Object.keys(message.info).length)
                this.info = null;
        }

        const adapterUpdate = typeof message.defaultbluetooth?.enabled === 'boolean';

        if (adapterUpdate)
            this.adapterEnabled = message.defaultbluetooth.enabled;

        if (adapterUpdate || Array.isArray(message.headphones) || object(message.info))
            this.render();
    }

    line(text, styleClass) {
        const item = new PopupMenu.PopupMenuItem(text, {reactive: false});
        if (styleClass)
            item.label.add_style_class_name(styleClass);
        this.addPassiveItem(item);
        return item;
    }

    action(text, callback) {
        const item = new PopupMenu.PopupMenuItem(text);
        item.connect('activate', callback);
        this.menu.addMenuItem(item);
        return item;
    }

    separator() {
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    }

    addDisplay(actor) {
        const item = new PopupMenu.PopupBaseMenuItem({reactive: false});
        item.addActor(actor, {expand: true, span: -1});
        this.addPassiveItem(item);
    }

    addPassiveItem(item) {
        this.menu.addMenuItem(item);
        this.passiveItems.push(item);
        this.useMenuForeground(item);
    }

    useMenuForeground(item) {
        const {red, green, blue} = this.menu.actor.get_theme_node().get_foreground_color();
        item.actor.set_style(`color: rgb(${red}, ${green}, ${blue});`);
    }

    batteryReadings(active) {
        const id = JSON.stringify([active.address.toUpperCase(), active.vendor, active.model]);
        if (!this.batteryHistory.has(id)) {
            if (this.batteryHistory.size >= 64)
                this.batteryHistory.delete(this.batteryHistory.keys().next().value);
            this.batteryHistory.set(id, {});
        }
        const history = this.batteryHistory.get(id);
        const pack = active.capabilities?.battery;
        for (const key of Object.keys(BATTERIES)) {
            const value = pack?.[key];
            if (battery(value)) {
                history[key] = {battery: value.battery, status: 3, charging: false};
                if (value.status === 2)
                    this.checkLow(active, key, BATTERIES[key][0], value);
            }
        }

        // Status 0 is Core's placeholder for every unreported slot. A disconnected
        // case slot or separate earbud data can establish a case-equipped layout.
        const reported = key => [1, 2, 3].includes(pack?.[key]?.status) || !!history[key];
        const split = reported('left') || reported('right');
        const keys = split ? ['left', 'right', 'case'] : [];
        if (!split && reported('single'))
            keys.push('single');
        if (!split && reported('case'))
            keys.push('case');
        return keys.map(key => [key, battery(pack?.[key]) ? pack[key] : history[key]]);
    }

    render() {
        const active = this.initialized && this.adapterEnabled !== false &&
            this.info?.connected ? this.info : null;
        const status = !this.initialized ? 'Waiting for MagicPodsCore' :
            this.adapterEnabled === false ? 'Bluetooth unavailable' : 'No active headphones';
        const readings = active ? this.batteryReadings(active) : [];
        const caps = active?.capabilities;
        const modes = listeningModes(caps?.anc);
        const wear = Number.isInteger(caps?.earDetectionState?.selected) ?
            WEAR_STATES[caps.earDetectionState.selected] : undefined;
        const selected = wearSettings(caps?.earDetection);
        const otherDevices = this.initialized && this.adapterEnabled !== false ?
            this.devices.filter(item => item.address !== active?.address) : [];
        const layout = JSON.stringify([
            active?.address, active?.name, status, readings.map(([key]) => key),
            modes.map(([mode]) => mode), !!(wear || selected), !!selected,
            otherDevices.map(({address, name, connected}) => [address, name, connected]),
        ]);
        if (layout !== this.layout) {
            this.layout = layout;
            this.buildMenu(active, status, readings, modes, !!(wear || selected),
                !!selected, otherDevices);
        }

        const display = JSON.stringify([readings, caps?.anc?.selected, caps?.anc?.readonly,
            wear, selected?.pauseMedia, caps?.earDetection?.readonly, this.lowThreshold]);
        if (layout === this.displayLayout && display === this.display)
            return;
        this.displayLayout = layout;
        this.display = display;
        for (const [key, value] of readings)
            this.updateBatteryCard(this.batteryCards[key], value);
        for (const [mode, item, radio] of this.modeItems) {
            const checked = caps.anc.selected === mode;
            radio.setToggleState(checked);
            if (checked)
                item.actor.add_style_class_name('magicpods-mode-selected');
            else
                item.actor.remove_style_class_name('magicpods-mode-selected');
            if (checked)
                item.actor.add_accessible_state(Atk.StateType.CHECKED);
            else
                item.actor.remove_accessible_state(Atk.StateType.CHECKED);
            item.setSensitive(caps.anc.readonly === false);
        }
        this.wearStatus?.set_text(wear ?? 'Unavailable');
        if (this.pauseSwitch) {
            this.pauseSwitch.setToggleState(selected.pauseMedia);
            this.pauseSwitch.setSensitive(caps.earDetection.readonly === false);
        }

        const details = readings.map(([key, value]) =>
            BATTERIES[key][0] + ' ' + (value ? value.battery + '%' +
                (value.status === 3 ? ' (cached)' : value.charging ? ' (charging)' : '') : 'Unavailable'));
        this.set_applet_tooltip([active ? active.name + ' · Connected' : status, ...details].join('\n'));
    }

    buildMenu(active, status, readings, modes, showWear, showSwitch, otherDevices) {
        this.passiveItems = [];
        this.menu.removeAll();
        this.batteryCards = {};
        this.modeItems = [];
        this.wearStatus = null;
        this.pauseSwitch = null;

        if (active) {
            const header = new St.BoxLayout({style_class: 'magicpods-header'});
            header.add_child(new St.Icon({icon_name: 'audio-headphones-symbolic', icon_size: 28}));
            const title = new St.BoxLayout({vertical: true, x_expand: true});
            const name = new St.Label({text: active.name, style_class: 'magicpods-device'});
            name.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
            title.add_child(name);
            const connection = new St.BoxLayout({style_class: 'magicpods-connection'});
            connection.add_child(new St.Widget({style_class: 'magicpods-status-dot',
                y_align: Clutter.ActorAlign.CENTER}));
            connection.add_child(new St.Label({text: 'Connected', style_class: 'magicpods-connected'}));
            title.add_child(connection);
            header.add_child(title);
            const configure = new St.Button({
                child: new St.Icon({icon_name: 'preferences-system-symbolic', icon_size: 19}),
                style_class: 'magicpods-configure',
                accessible_name: 'Configure MagicPods', can_focus: true,
                y_align: Clutter.ActorAlign.CENTER,
            });
            configure.connect('clicked', () => {
                this.menu.close();
                this.configureApplet();
            });
            header.add_child(configure);
            this.addDisplay(header);

            if (readings.length) {
                this.separator();
                const row = new St.BoxLayout({style_class: 'magicpods-batteries'});
                for (const [key] of readings)
                    this.addBatteryCard(row, key);
                this.addDisplay(row);
            }

            if (modes.length) {
                this.separator();
                this.line('Listening Mode', 'magicpods-section');
                for (const [mode, label] of modes) {
                    const item = new PopupMenu.PopupBaseMenuItem({style_class: 'magicpods-mode'});
                    const radio = new RadioButton.RadioBox(false);
                    radio.actor.reactive = false;
                    radio.actor.can_focus = false;
                    const text = new St.Label({text: label});
                    item.addActor(radio.actor, {span: 0});
                    item.addActor(text);
                    item.actor.label_actor = text;
                    item.actor.accessible_role = Atk.Role.RADIO_MENU_ITEM;
                    item.activate = event =>
                        PopupMenu.PopupBaseMenuItem.prototype.activate.call(item, event, true);
                    item.connect('activate', () => this.setListeningMode(active.address, mode));
                    this.menu.addMenuItem(item);
                    this.modeItems.push([mode, item, radio]);
                }
            }

            if (showWear) {
                this.separator();
                this.line('Device Settings', 'magicpods-section');
                const wearRow = new St.BoxLayout({style_class: 'magicpods-detail-row'});
                wearRow.add_child(new St.Icon({icon_name: 'audio-headset-symbolic', icon_size: 16}));
                wearRow.add_child(new St.Label({text: 'In-ear detection', x_expand: true}));
                this.wearStatus = new St.Label({style_class: 'magicpods-secondary'});
                wearRow.add_child(this.wearStatus);
                this.addDisplay(wearRow);
                if (showSwitch) {
                    this.pauseSwitch = new PopupMenu.PopupSwitchIconMenuItem(
                        'Automatic pause and resume', false, 'media-playback-pause-symbolic',
                        St.IconType.SYMBOLIC);
                    this.pauseSwitch.connect('toggled', (item, enabled) =>
                        this.setPause(active.address, item, enabled));
                    this.menu.addMenuItem(this.pauseSwitch);
                }
            }
        } else {
            this.line(status);
        }

        if (otherDevices.length && active)
            this.separator();
        for (const item of otherDevices) {
            const verb = item.connected ? 'Disconnect' : 'Connect';
            this.action(verb + ' ' + item.name,
                () => this.send(verb + 'Device', {address: item.address}));
        }
        if (active) {
            this.separator();
            const item = new PopupMenu.PopupIconMenuItem(
                'Disconnect', 'network-offline-symbolic', St.IconType.SYMBOLIC);
            item.connect('activate', () => {
                if (this.info?.address === active.address && this.info.connected)
                    this.send('DisconnectDevice', {address: active.address});
            });
            this.menu.addMenuItem(item);
        }
    }

    addBatteryCard(row, key) {
        const [label, icon] = BATTERIES[key];
        const card = new St.BoxLayout({vertical: true, x_expand: true, style_class: 'magicpods-battery'});
        const percentage = new St.Label({style_class: 'magicpods-percentage'});
        const fill = new St.Widget({style_class: 'magicpods-fill'});
        const track = new St.Bin({
            width: BATTERY_BAR_WIDTH, x_align: St.Align.START, x_fill: false,
            child: fill, style_class: 'magicpods-track',
        });
        const detail = new St.Label({style_class: 'magicpods-battery-detail'});
        card.add_child(new St.Icon({icon_name: icon, icon_size: 16}));
        card.add_child(new St.Label({text: label, style_class: 'magicpods-battery-label'}));
        card.add_child(percentage);
        card.add_child(track);
        card.add_child(detail);
        row.add_child(card);
        const widgets = {percentage, track, fill, detail, fraction: 0};
        track.connect('notify::width', () => this.resizeBatteryFill(widgets));
        this.batteryCards[key] = widgets;
    }

    updateBatteryCard(card, value) {
        const low = value?.status === 2 && !value.charging && value.battery <= this.lowThreshold;
        card.percentage.set_text(value ? value.battery + '%' : '—');
        card.fraction = value ? value.battery / 100 : 0;
        this.resizeBatteryFill(card);
        card.fill.visible = !!value?.battery;
        card.fill.set_style_class_name('magicpods-fill' +
            (value?.status === 3 ? ' magicpods-cached' : low ? ' magicpods-low' : ''));
        card.detail.set_text(!value ? 'Unavailable' : value.status === 3 ? 'Cached' :
            value.charging ? 'Charging' : low ? 'Low battery' : '');
    }

    resizeBatteryFill(card) {
        card.fill.set_width(Math.round(card.track.width * card.fraction));
    }

    setListeningMode(address, mode) {
        const active = this.info;
        const anc = active?.capabilities?.anc;
        if (active?.address !== address || !active.connected || anc?.readonly !== false ||
            anc.selected === mode || !listeningModes(anc).some(([option]) => option === mode))
            return;
        this.send('SetCapabilities', {address, capabilities: {anc: {selected: mode}}});
    }

    setPause(address, item, enabled) {
        const active = this.info;
        const detection = active?.capabilities?.earDetection;
        const selected = wearSettings(detection);
        item.setToggleState(selected?.pauseMedia ?? false);
        if (active?.address !== address || !active.connected ||
            detection?.readonly !== false || !selected || selected.pauseMedia === enabled)
            return;
        this.send('SetCapabilities', {address, capabilities: {earDetection: {selected: {
            pauseMedia: enabled,
            switchToSpeakers: selected.switchToSpeakers,
            lowerVolume: selected.lowerVolume,
        }}}});
    }

    checkLow(active, key, label, value) {
        if (value.status !== 2 || !active.connected)
            return;

        const id = active.address + '/' + key;

        if (value.charging || value.battery > this.lowThreshold) {
            this.low.delete(id);
        } else if (this.lowAlerts && !this.low.has(id)) {
            if (this.low.size >= 256)
                this.low.delete(this.low.keys().next().value);

            this.low.set(id, true);
            Main.notify('MagicPods · Low battery', label + ' · ' + value.battery + '%');
        }
    }

    on_applet_clicked() {
        this.menu.toggle();

        // Core 2.0.12 does not broadcast a list when a disconnected device is paired or removed.
        if (this.menu.isOpen)
            this.send('GetDevices');
    }

    on_applet_removed_from_panel() {
        this.cancellable.cancel();
        this.clearHandshake();

        if (this.retryId)
            GLib.source_remove(this.retryId);

        if (this.socket?.get_state() === Soup.WebsocketState.OPEN)
            this.socket.close(1000, null);

        this.session.abort();
        this.settings.finalize();
        this.menu.destroy();
    }
}

function main(metadata, orientation, panelHeight, instanceId) {
    return new MagicPodsApplet(metadata, orientation, panelHeight, instanceId);
}