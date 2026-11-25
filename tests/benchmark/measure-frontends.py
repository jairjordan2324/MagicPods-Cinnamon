import ast
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess as sp
import sys
import tempfile
import time

home = Path.home()
uuid = 'magicpods-cinnamon@local'
applet = home / '.local/share/cinnamon/applets' / uuid
qt = home / '.local/opt/magicpods/magicpods'
work = Path(tempfile.mkdtemp(prefix='magicpods-benchmark-'))
files = ('applet.js','metadata.json','settings-schema.json','stylesheet.css')
duration = 30
clk = os.sysconf('SC_CLK_TCK')

def cmd(*argv):
    return sp.check_output(argv, text=True).strip()

def pids(name):
    p = sp.run(['pgrep', '-u', str(os.getuid()), '-x', name], capture_output=True, text=True)
    return [int(v) for v in p.stdout.split()]

def get_layout():
    return ast.literal_eval(cmd('gsettings','get','org.cinnamon','enabled-applets').removeprefix('@as '))

def set_layout(layout):
    cmd('gsettings','set','org.cinnamon','enabled-applets',repr(layout))

def reload():
    cmd('gdbus','call','--session','--dest','org.Cinnamon.LookingGlass','--object-path',
        '/org/Cinnamon/LookingGlass','--method','org.Cinnamon.LookingGlass.ReloadExtension',uuid,'APPLET')

def popup(visible):
    action = 'open' if visible else 'close'
    expression = "(() => { const a=imports.ui.appletManager.get_object_for_uuid('" + uuid + "', '" + instance + "'); a.menu." + action + "(false); return a.menu.isOpen; })()"
    out = cmd('gdbus','call','--session','--dest','org.Cinnamon','--object-path',
        '/org/Cinnamon','--method','org.Cinnamon.Eval',expression)
    if out != ("(true, 'true')" if visible else "(true, 'false')"):
        raise RuntimeError(out)

def snapshot(pid):
    root = Path('/proc')/str(pid)
    data = (root/'stat').read_text().rsplit(')',1)[1].split()
    memory = {}
    for line in (root/'smaps_rollup').read_text().splitlines():
        if line.startswith(('Rss:', 'Pss:')):
            key, amount, _ = line.split()
            memory[key[:-1]] = int(amount)
    return (int(data[11])+int(data[12]), memory['Rss'], memory['Pss'])

def assert_core():
    if pids('magicpodscore') != [core]:
        raise RuntimeError('Existing Core process changed; benchmark stopped')
    lines = cmd('ss','-H','-ltnp','sport = :2020').splitlines()
    if len(lines)!=1 or lines[0].split()[3]!='127.0.0.1:2020' or f'pid={core},' not in lines[0]:
        raise RuntimeError('Unexpected backend listener')

def websocket(pid):
    socket_text = cmd('ss','-H','-tinp','dport = :2020').splitlines()
    for i,line in enumerate(socket_text[:-1]):
        if f'pid={pid},' in line:
            return (line.split()[3], *[int(re.search(key+r':(\d+)', socket_text[i+1])[1])
                for key in ('bytes_sent','bytes_received')])
    raise RuntimeError('Frontend socket is absent')

def sample(label, q=None, has_applet=False):
    time.sleep(5)
    assert_core()
    front=q.pid if q else cinnamon if has_applet else None
    measured={'cinnamon':cinnamon,'core':core}
    if q: measured['qt']=q.pid
    a={name:snapshot(pid) for name,pid in measured.items()}
    wire_a=websocket(front) if front else None
    now=time.monotonic()
    time.sleep(duration)
    elapsed=time.monotonic()-now
    assert_core()
    b={name:snapshot(pid) for name,pid in measured.items()}
    wire_b=websocket(front) if front else None
    stats={k:{'rss_kib':v[1],'pss_kib':v[2],'cpu':round((v[0]-a[k][0])/(clk*elapsed)*100,2)} for k,v in b.items()}
    record={'profile':label,'seconds':round(elapsed,2),'processes':stats,
            'counts':{name:len(pids(name)) for name in ('cinnamon','magicpodscore','magicpods','bluetoothd','blueman-applet','blueman-tray','blueman-manager')}}
    if wire_a and wire_b and wire_a[0]==wire_b[0]:
        record['tcp_delta_bytes']=[wire_b[i]-wire_a[i] for i in (1,2)]
    print(json.dumps(record),flush=True)

def stage(source):
    for name in files:
        src=source/name
        dest=applet/name
        if src.exists():
            shutil.copyfile(src,dest)
            dest.chmod(0o600)
        elif dest.exists():
            dest.unlink()

def restore():
    for proc in qt_children:
        if proc.poll() is None:
            proc.terminate()
            proc.wait(timeout=6)
    stage(saved)
    set_layout(layout)
    reload()

def on_signal(signum, frame):
    raise SystemExit(128+signum)

signal.signal(signal.SIGTERM,on_signal)
signal.signal(signal.SIGINT,on_signal)
cores=pids('magicpodscore')
shells=pids('cinnamon')
if len(cores)!=1 or len(shells)!=1 or pids('magicpods'):
    raise SystemExit('Expected exactly one Core, one Cinnamon, and no Qt MagicPods instance')
core,cinnamon=cores[0],shells[0]
assert_core()
layout=get_layout()
entries=[item for item in layout if f':{uuid}:' in item]
if len(entries)!=1:
    raise SystemExit('Expected one installed and enabled MagicPods applet')
instance=entries[0].rsplit(':',1)[1]
idle_layout=[item for item in layout if item not in entries]
saved=work/'current'
previous=work/'previous'
saved.mkdir()
previous.mkdir()
for name in files:
    path=applet/name
    if path.exists(): shutil.copy2(path,saved/name)
    src=sp.run(['git','show',f'f3d2184:applet/{name}'],capture_output=True)
    if src.returncode==0: (previous/name).write_bytes(src.stdout)
    elif name!='stylesheet.css': raise SystemExit("Baseline files unavailable")
qt_children=[]
print('Backed up installed applet to',saved,flush=True)
try:
    set_layout(idle_layout)
    sample('shell without frontend')
    for active in (False,True):
        log=(work/('qt-active.log' if active else 'qt-idle.log')).open('wb')
        with log:
            # Prevent the Qt recovery path from launching the original Bluetooth backend.
            proc=sp.Popen([str(qt)]+([] if active else ['--background']),cwd=qt.parent,
                env=dict(os.environ,MAGICPODSCORE_PATH='/usr/bin/false'),stdout=log,stderr=sp.STDOUT)
        qt_children.append(proc)
        sample('Qt visible' if active else 'Qt background',q=proc)
        proc.terminate()
        proc.wait(timeout=6)
    stage(previous)
    set_layout(layout)
    reload()
    popup(False)
    sample('Cinnamon f3d2184 menu closed',has_applet=True)
    popup(True)
    sample('Cinnamon f3d2184 menu open',has_applet=True)
    popup(False)
    stage(saved)
    reload()
    popup(False)
    sample('Cinnamon redesigned menu closed',has_applet=True)
    popup(True)
    sample('Cinnamon redesigned menu open',has_applet=True)
    popup(False)
finally:
    restore()
