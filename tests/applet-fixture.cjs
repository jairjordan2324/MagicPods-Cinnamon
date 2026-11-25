const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
class Actor {
    constructor(props) {
        Object.assign(this, props);
        this.children = [];
        this.clutter_text = {set_ellipsize() {}};
    }
    add_child(child) { this.children.push(child); }
    set_style(value) { this.style = value; }
    set_text(text) { this.text = text; }
    set_width(width) { this.width = width; }
    set_style_class_name(value) { this.style_class = value; }
    add_style_class_name() {}
    remove_style_class_name() {}
    connect() {}
    add_accessible_state() {}
    remove_accessible_state() {}
}
class Item {
    constructor(text) {
        this.actor = new Actor();
        this.label = new Actor({text});
        this.handlers = {};
    }
    addActor(actor) { this.actor.add_child(actor); }
    connect(key, func) { this.handlers[key] = func; }
    activate(event) { this.handlers.activate?.(this, event); }
    setLabel(text) { this.label.set_text(text); }
    setSensitive(value) { this.sensitive = value; }
    setToggleState(value) { this.checked = value; }
}
const notices = [];
const context = {imports: {
    gi: {versions: {}, Clutter: {ActorAlign: {CENTER:0}}, St: {IconType: {SYMBOLIC:0}, Button: Actor, BoxLayout: Actor, Label: Actor, Icon: Actor, Widget: Actor, Bin: Actor, Align: {START: 0}},
        Atk: {Role: {RADIO_MENU_ITEM: 1}, StateType: {CHECKED: 1}}, Pango: {EllipsizeMode: {END: 0}}},
    byteArray: {toString: value => value},
    ui: {
        applet: {IconApplet: class {}},
        popupMenu: {PopupMenuItem: Item, PopupBaseMenuItem: Item, PopupSeparatorMenuItem: Item, PopupSwitchMenuItem: Item, PopupSwitchIconMenuItem: Item, PopupIconMenuItem: Item},
        main: {notify(...v) { notices.push(v); }},
        radioButton: {RadioBox: class extends Item {}},
    },
}};
vm.createContext(context);
const app = vm.runInContext(fs.readFileSync('applet/applet.js', 'utf8') + '\nObject.create(MagicPodsApplet.prototype)', context);
let builds = 0, rows, requests = [];
Object.assign(app, {
    menu: {actor: {get_theme_node: () => ({get_foreground_color: () => ({red:1,green:2,blue:3})})}, removeAll() { builds++; rows = []; }, addMenuItem(item) { rows.push(item); }},
    set_applet_tooltip() {},
    send(method, args) { requests.push([method, args]); },
    batteryHistory: new Map(), low: new Map(), lowAlerts: true, lowThreshold: 20, devices: [],
});
function receive(value) {
    const json = JSON.stringify(value);
    app.receive({get_size: () => json.length, get_data: () => json});
}
const clone = value => JSON.parse(JSON.stringify(value));
const entry = (battery, charging = false, status = 2) => ({battery, charging, status});
const initial = {address: ['AA', 'BB', 'CC', 'DD', 'EE', 'FF'].join(':'), name: 'Headphones', vendor: 76, model: 8221,
    connected: true, capabilities: {
        battery: {left: entry(15), right: entry(82, true), case: entry(0, false, 1), single: entry(0, false, 0)},
        anc: {options: 19, selected: 16, readonly: false},
        earDetection: {readonly: false, selected: {pauseMedia: false, switchToSpeakers: true, lowerVolume: 30}},
        earDetectionState: {selected: 2},
    }};
let info = clone(initial);
receive({init: {api: 2}});
assert.equal(requests.length, 0);
receive({init: {api: 1}});
assert.equal(requests[0][0], 'GetAll');
receive({info, headphones: [info]});
assert.equal(app.batteryCards.case.detail.text, 'Unavailable');
assert.equal(app.batteryCards.case.percentage.text, '—');
assert.equal(app.batteryCards.left.detail.text, 'Low battery');
assert.equal(app.batteryCards.right.detail.text, 'Charging');
assert.equal(notices.length, 1);
assert.deepEqual(Array.from(app.modeItems, x => x[2].checked), [false, false, true]);
const initialBuilds = builds;
const originalOff = app.modeItems[0][1];
originalOff.activate();
assert.deepEqual(clone(requests.at(-1)), ['SetCapabilities',
    {address: info.address, capabilities: {anc: {selected: 1}}}]);
assert.equal(app.modeItems[0][2].checked, false);
info.capabilities.anc.selected = 2;
info.capabilities.battery.case = entry(0, true);
receive({info});
assert.deepEqual(Array.from(app.modeItems, x => x[2].checked), [false, true, false]);
assert.equal(app.batteryCards.case.percentage.text, '0%');
assert.equal(app.batteryCards.case.detail.text, 'Charging');
assert.equal(builds, initialBuilds);
assert.equal(app.modeItems[0][1], originalOff);
info.capabilities.battery.case = entry(76, true, 3);
receive({info});
assert.equal(app.batteryCards.case.detail.text, 'Cached');
delete info.capabilities.battery.case;
info.capabilities.anc = {options: 19, selected: 64, readonly: true};
receive({info});
assert.equal(app.batteryCards.case.percentage.text, '76%');
assert.equal(app.batteryCards.case.detail.text, 'Cached');
assert.deepEqual(Array.from(app.modeItems, x => x[2].checked), [false, false, false]);
assert.equal(app.modeItems.every(x => !x[1].sensitive), true);
let count = requests.length;
originalOff.activate();
assert.equal(requests.length, count);
app.pauseSwitch.handlers.toggled(app.pauseSwitch, true);
assert.deepEqual(clone(requests.at(-1)[1].capabilities.earDetection.selected),
    {pauseMedia: true, switchToSpeakers: true, lowerVolume: 30});
assert.equal(app.pauseSwitch.checked, false);
info.capabilities.anc = {options: 18, selected: 2, readonly: false};
receive({info});
assert.deepEqual(Array.from(app.modeItems, x => x[0]), [2, 16]);
count = requests.length;
originalOff.activate();
assert.equal(requests.length, count);
rows.at(-1).activate();
assert.deepEqual(clone(requests.at(-1)), ['DisconnectDevice', {address: info.address}]);
receive({info: {}, headphones: [{...info, connected: false}]});
assert.equal(app.modeItems.length, 0);
rows.at(-1).activate();
assert.deepEqual(clone(requests.at(-1)), ['ConnectDevice', {address: info.address}]);
const other = {address: ['11', '22', '33', '44', '55', '66'].join(':'), connected: true, name: 'Single pack',
    capabilities: {battery: {single: entry(55), case: entry(0, false, 0)}}};
receive({info: other, headphones: [other]});
assert.deepEqual(Object.keys(app.batteryCards), ['single']);
receive({info: {...initial, capabilities: {}}, headphones: [initial]});
assert.equal(app.batteryCards.case.percentage.text, '76%');
assert.equal(app.batteryCards.case.detail.text, 'Cached');
assert.equal(app.modeItems.length, 0);
console.log('PASS native menu model, stable rows, battery validity/cache/device boundaries, ANC masks and writes, readonly and unknown state, wear payload, connection actions');
