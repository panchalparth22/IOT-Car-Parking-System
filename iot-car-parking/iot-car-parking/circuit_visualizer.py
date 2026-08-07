#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
IoT CAR PARKING — REALISTIC HARDWARE CIRCUIT DIAGRAM
ESP32 DevKit V4 · Breadboard · 12 Status LEDs · 2 Servo Gates · I2C LCD · IR Sensors
LED colors: GREEN=empty · ORANGE=booked · RED=occupied
Zoom: scroll wheel  ·  Pan: middle-click drag  ·  Reset: Ctrl+0
"""

import tkinter as tk
import json, threading, time, math
from urllib.request import Request, urlopen

SRV = "http://localhost:3000"
NS = 12

# ─── STATE ──────────────────────────────────────────────
slots = [False]*NS
slot_regs = [None]*NS
slot_booked = [False]*NS
svOk = False
tSes = 0; tRev = 0; selSlot = 0
gateE_open = gateX_open = False
lcd1 = ""; lcd2 = ""

# ─── HTTP ───────────────────────────────────────────────
def http_get(p):
    try:
        r = urlopen(Request(SRV+p, headers={"Accept":"application/json"}), timeout=3)
        return json.loads(r.read().decode())
    except: return None
def http_post(p,d):
    try:
        r = urlopen(Request(SRV+p, data=json.dumps(d).encode(),
                          headers={"Content-Type":"application/json"}), timeout=5)
        return json.loads(r.read().decode())
    except: return None

def sync():
    global slots, slot_regs, slot_booked, svOk, tSes, tRev
    d = http_get("/api/parking/slots")
    if d and "slots" in d:
        svOk=True; occ=0
        for s in d["slots"]:
            i=s["slot_number"]-1; st=s["status"]
            slots[i]=(st=="occupied"); slot_booked[i]=(st=="booked")
            slot_regs[i]=s.get("car",{}).get("car_registration") if st=="occupied" else None
            if st=="occupied": occ+=1
        tSes=d.get("filled",occ)
        root.after(0,update_ui)
    else: svOk=False; root.after(0,update_ui)

ws_running=True
def ws_listen():
    global ws_running
    while ws_running:
        try:
            import websocket
            ws=websocket.create_connection("ws://localhost:3000",timeout=5)
            ws.settimeout(10)
            while ws_running:
                try:
                    raw=ws.recv()
                    if raw:
                        msg=json.loads(raw)
                        if msg.get("type") in ("entry","booking-arriving","booking","slots-update","booking-cancel","exit"):
                            root.after(100,lambda:(sync(),update_ui()))
                except: break
        except: pass
        if ws_running: time.sleep(3)

# ════════════════════════════════════════════════════════
# ROOT — MAXIMIZED NORMAL WINDOW, RESPONSIVE
# ════════════════════════════════════════════════════════
root=tk.Tk()
root.title("IoT Car Parking — Hardware Circuit")
root.configure(bg="#101018")

# Maximise window (not fullscreen)
root.state("zoomed")
root.update_idletasks()

# Base design was 1080×780; compute scale factor to fit window
W, H = 1080, 780  # base coordinates (referenced throughout)
cw, ch = root.winfo_width(), root.winfo_height()
S = min(cw / W, ch / H)
S = max(0.4, min(2.0, S))  # clamp to reasonable bounds

cv=tk.Canvas(root,bg="#101018",highlightthickness=0)
cv.pack(fill=tk.BOTH, expand=True)

# ── Auto-scaling drawing wrappers ──
def _sc(*a):
    """Scale numeric args by global S factor."""
    return [int(v*S) if isinstance(v,(int,float)) else v for v in a]

def _sf(font):
    """Scale font tuple by S."""
    if not font: return font
    fam, sz, *rest = font
    return (fam, max(4,int(sz*S)), *rest)

def rbox(*a,**kw):
    x1,y1,x2,y2 = _sc(a[0],a[1],a[2],a[3])
    return cv.create_rectangle(x1,y1,x2,y2,*a[4:],**kw)
def rtxt(x,y,**kw):
    if "font" in kw: kw["font"]=_sf(kw["font"])
    rx,ry = _sc(x,y)
    return cv.create_text(rx,ry,**kw)
def rlin(*a,**kw):
    if "width" in kw and isinstance(kw["width"],(int,float)):
        kw["width"]=max(1,int(kw["width"]*S))
    return cv.create_line(*_sc(*a),**kw,capstyle=tk.ROUND)
def rovl(*a,**kw):
    x1,y1,x2,y2 = _sc(a[0],a[1],a[2],a[3])
    if "width" in kw and isinstance(kw["width"],(int,float)):
        kw["width"]=max(1,int(kw["width"]*S))
    return cv.create_oval(x1,y1,x2,y2,*a[4:],**kw)

# ── Transform state (zoom / pan) ──
zoom_level = 1.0   # cumulative zoom applied to canvas "all" items
pan_x = 0.0         # cumulative pan offset
pan_y = 0.0

# Mouse wheel zoom (centred on cursor — game-style, no reversing)
def on_wheel(ev):
    global zoom_level, pan_x, pan_y
    old_z = zoom_level
    new_z = max(0.2, min(5.0, old_z * (1.1 if ev.delta > 0 else 0.9)))
    r = new_z / old_z

    # Apply delta zoom centred on mouse cursor.
    # canvas.scale permanently modifies item coords:
    #   new = cx + r * (old - cx)
    cv.scale("all", ev.x, ev.y, r, r)

    # Update pan tracking: after a scale by r around (ex, ey),
    # the effective pan becomes ex + r * (old_pan - ex)
    pan_x = ev.x + r * (pan_x - ev.x)
    pan_y = ev.y + r * (pan_y - ev.y)
    zoom_level = new_z

    # Update zoom indicator
    cv.itemconfig(zoom_indicator, text=f"Zoom: {int(new_z*100)}%")

cv.bind("<MouseWheel>", on_wheel)

# Pan with middle-click drag
pan_data = {"x":0,"y":0}
def on_pan_start(ev):
    pan_data["x"], pan_data["y"] = ev.x, ev.y
    cv.config(cursor="fleur")
def on_pan_move(ev):
    global pan_x, pan_y
    dx, dy = ev.x - pan_data["x"], ev.y - pan_data["y"]
    cv.move("all", dx, dy)
    pan_x += dx; pan_y += dy
    pan_data["x"], pan_data["y"] = ev.x, ev.y
def on_pan_end(ev):
    cv.config(cursor="")
cv.bind("<ButtonPress-2>", on_pan_start)
cv.bind("<B2-Motion>", on_pan_move)
cv.bind("<ButtonRelease-2>", on_pan_end)

# ════════════════════════════════════════════════════════
# TITLE
# ════════════════════════════════════════════════════════
rtxt(540,14,text="IOT CAR PARKING — REALISTIC HARDWARE CIRCUIT",
      fill="#58a6ff",font=("Segoe UI",11,"bold"))
rtxt(540,30,text="ESP32 DevKit V4  |  Breadboard  |  12x Slot LEDs  |  2x SG90 Servo Gates  |  I2C LCD  |  IR Entry/Exit",
      fill="#484f58",font=("Segoe UI",7))

conn_dot=rovl(980,12,990,20,fill="#e74c3c",outline="")
conn_txt=rtxt(994,16,text="Disconnected",fill="#e74c3c",font=("Segoe UI",7),anchor="w")
rev_txt=rtxt(980,32,text="Revenue: £0",fill="#ffd700",font=("Segoe UI",7,"bold"),anchor="w")
zoom_indicator = rtxt(20,450,text="Zoom: 100%   |   Ctrl+0 to reset",fill="#484f58",font=("Segoe UI",6),anchor="w")

# ════════════════════════════════════════════════════════
# 1 —  ESP32 DEVKIT V4  (REALISTIC BLUE PCB)
# ════════════════════════════════════════════════════════
EX,EY,EW,EH = 16,44,152,240

# PCB (realistic blue — DOIT ESP32 DevKit color)
rbox(EX,EY,EX+EW,EY+EH,fill="#152b5e",outline="#2a5a9e",width=2)
# Inner PCB layer
rbox(EX+2,EY+2,EX+EW-2,EY+EH-2,fill="#1a3a7a",outline="")

# PCB silk outline (white dotted)
rbox(EX+8,EY+8,EX+EW-8,EY+EH-8,fill="",outline="#4a7acc",width=1,dash=(2,4))

# Mounting holes
for hx,hy in [(EX+8,EY+6),(EX+EW-8,EY+6),(EX+8,EY+EH-6),(EX+EW-8,EY+EH-6)]:
    rovl(hx-4,hy-4,hx+4,hy+4,fill="#0a0a14",outline="#4a7acc",width=1)
    rovl(hx-2,hy-2,hx+2,hy+2,fill="#111",outline="")

# ESP32-WROOM-32 MODULE (Metal shield can)
MX,MY,MW,MH = EX+26,EY+50,100,72
# Silver metal shield with bevel
rbox(MX,MY,MX+MW,MY+MH,fill="#c0c0c0",outline="#888",width=2)
rbox(MX+2,MY+2,MX+MW-2,MY+MH-2,fill="#d4d4d4",outline="")
# Module label
rtxt(MX+MW//2,MY+20,text="ESP32-WROOM-32",fill="#1a1a1a",font=("Segoe UI",8,"bold"))
rtxt(MX+MW//2,MY+34,text="Dual-Core 240MHz",fill="#444",font=("Segoe UI",6))
rtxt(MX+MW//2,MY+46,text="16MB Flash  ·  512KB SRAM",fill="#555",font=("Segoe UI",5))
rtxt(MX+MW//2,MY+56,text="WiFi + BLE 5.0",fill="#666",font=("Segoe UI",5))
rtxt(MX+MW//2,MY+66,text="Rev 1.0  |  MADE IN CHINA",fill="#777",font=("Segoe UI",4))

# Metal shield edge bevel (light reflection)
rlin(MX+4,MY+2,MX+MW-4,MY+2,fill="#eee",width=1)

# CP2102 USB-to-Serial IC (below module)
CPX,CPY=EX+40,EY+130
rbox(CPX,CPY,CPX+32,CPY+18,fill="#1a1a1a",outline="#555",width=1)
rtxt(CPX+16,CPY+9,text="CP2102",fill="#aaa",font=("Segoe UI",5))

# Micro-USB port
USBX,USBY=EX+60,EY+4
rbox(USBX,USBY,USBX+32,USBY+10,fill="#222",outline="#666",width=2)
rbox(USBX+4,USBY-2,USBX+28,USBY+4,fill="#444",outline="#888",width=1)
rtxt(USBX+16,USBY+14,text="Micro-USB",fill="#888",font=("Segoe UI",5))

# EN (Reset) and BOOT buttons
# EN button
rbox(EX+10,EY+EH-50,EX+28,EY+EH-38,fill="#1a1a1a",outline="#666",width=1)
rovl(EX+13,EY+EH-48,EX+25,EY+EH-40,fill="#333",outline="")
rtxt(EX+19,EY+EH-44,text="EN",fill="#888",font=("Segoe UI",5,"bold"))
rtxt(EX+19,EY+EH-52,text="RST",fill="#555",font=("Segoe UI",4))
rlin(EX+10,EY+EH-38,EX+28,EY+EH-38,fill="#666",width=2)

# BOOT button
rbox(EX+EW-28,EY+EH-50,EX+EW-10,EY+EH-38,fill="#1a1a1a",outline="#666",width=1)
rovl(EX+EW-25,EY+EH-48,EX+EW-13,EY+EH-40,fill="#333",outline="")
rtxt(EX+EW-19,EY+EH-44,text="BOOT",fill="#888",font=("Segoe UI",5,"bold"))
rlin(EX+EW-28,EY+EH-38,EX+EW-10,EY+EH-38,fill="#666",width=2)

# 3.3V Voltage Regulator
VRX=EX+EW-38; VRY=EY+EH-24
rbox(VRX,VRY,VRX+24,VRY+12,fill="#1a1a1a",outline="#555",width=1)
rtxt(VRX+12,VRY+6,text="AMS1117",fill="#aaa",font=("Segoe UI",4))
rtxt(VRX+12,VRY-4,text="3.3V REG",fill="#555",font=("Segoe UI",4))

# Power LED (Red — real ESP32 has red PWR LED)
rovl(EX+8,EY+EH-22,EX+14,EY+EH-16,fill="#e74c3c",outline="")
rtxt(EX+11,EY+EH-24,text="PWR",fill="#e74c3c",font=("Segoe UI",4))

# GPIO2 LED (Blue — on ESP32)
rovl(EX+18,EY+EH-22,EX+24,EY+EH-16,fill="#3498db",outline="")
rtxt(EX+21,EY+EH-24,text="L",fill="#3498db",font=("Segoe UI",4))

# PIN HEADERS (2 rows × 19 pins — realistic 2.54mm pitch)
PIN_R = 3
PIN_GAP = 4
PIN_OFF = 12

# Left pin header row
for pi in range(19):
    py = EY + 42 + pi * (PIN_GAP + 2)
    px = EX + 5
    rovl(px-2,py,px+2,py+4,fill="#ccc",outline="#888",width=1)
    # Solder pad
    rovl(px-1,py+1,px+1,py+3,fill="#888",outline="")

# Right pin header row
for pi in range(19):
    py = EY + 42 + pi * (PIN_GAP + 2)
    px = EX + EW - 5
    rovl(px-2,py,px+2,py+4,fill="#ccc",outline="#888",width=1)
    rovl(px-1,py+1,px+1,py+3,fill="#888",outline="")

# Pin labels (right side — GPIO)
for i,(lbl,c) in enumerate([
    ("D16","#58a6ff"),("D17","#58a6ff"),("D18","#58a6ff"),("D19","#58a6ff"),
    ("SDA","#f0883e"),("SCL","#f0883e"),("D23","#58a6ff"),("5V","#e74c3c"),
    ("3V3","#e74c3c"),("EN","#888"),("GND","#3498db"),
]):
    py = EY+44+i*12
    if py > EY+EH-20: break
    rtxt(EX+EW+22,py,text=lbl,fill=c,font=("Segoe UI",5,"bold"),anchor="w")

# Pin labels (left side)
for i,(lbl,c) in enumerate([
    ("ADC","#d2a8ff"),("D5","#58a6ff"),("D4","#58a6ff"),("D2","#58a6ff"),
    ("D15","#58a6ff"),("D14","#58a6ff"),("D13","#58a6ff"),("D12","#58a6ff"),
    ("GND","#3498db"),("VIN","#e74c3c"),
]):
    py = EY+44+i*12
    if py > EY+EH-20: break
    rtxt(EX-6,py,text=lbl,fill=c,font=("Segoe UI",5,"bold"),anchor="e")

# ESP32 board label (silkscreen text)
rtxt(EX+EW//2,EY+EH-62,text="DOIT ESP32 DEVKIT V4",fill="#4a7acc",
      font=("Segoe UI",5))

# ════════════════════════════════════════════════════════
# 2 —  BREADBOARD
# ════════════════════════════════════════════════════════
BX,BY,BW,BH = 205,44,620,318

# Breadboard body
rbox(BX,BY,BX+BW,BY+BH,fill="#f0e6d0",outline="#222",width=2)
rbox(BX+2,BY+2,BX+BW-2,BY+BH-2,fill="#fdf6ee",outline="")

rtxt(BX+BW//2,BY+10,text="BREADBOARD (830 points)",fill="#aaa",font=("Segoe UI",5,"bold"))

# Power rails
for ci in range(0,BW-20,5):
    xo=BX+12+ci
    rbox(xo,BY+18,xo+3,BY+28,fill="#e74c3c",outline="")
    rbox(xo,BY+32,xo+3,BY+42,fill="#3498db",outline="")
    rbox(xo,BY+BH-44,xo+3,BY+BH-34,fill="#e74c3c",outline="")
    rbox(xo,BY+BH-30,xo+3,BY+BH-20,fill="#3498db",outline="")

rtxt(BX+10,BY+23,text="(+)",fill="#e74c3c",font=("Segoe UI",5,"bold"))
rtxt(BX+10,BY+37,text="(-)",fill="#3498db",font=("Segoe UI",5,"bold"))

# Hole grid (sparser for clarity)
for ri in range(24):
    for ci in range(55):
        # Skip center gap columns (27-28)
        if 27 <= ci <= 28: continue
        hx = BX+18+ci*10
        hy = BY+52+ri*10
        if hy > BY+BH-45: continue
        rovl(hx-2,hy-2,hx+2,hy+2,fill="#d4cbb8",outline="#cbbca5",width=1)

# Center gap line
gc_y = BY+52+12*10
rlin(BX+2,gc_y,BX+BW-2,gc_y,fill="#d5c9b5",width=4)
rtxt(BX+BW//2,gc_y-2,text="CENTRAL DIVIDER",fill="#bbb",font=("Segoe UI",5))

# Row labels (A-J top, K-T bottom — standard breadboard)
for ri in range(10):
    rtxt(BX-4,BY+52+ri*10,text=chr(65+ri),fill="#bbb",font=("Segoe UI",4))
    rtxt(BX-4,gc_y+6+ri*10,text=chr(75+ri),fill="#bbb",font=("Segoe UI",4))

# Column numbers
for ci in range(55):
    if 27<=ci<=28: continue
    rtxt(BX+18+ci*10,BY+46,text=f"{ci+1}",fill="#bbb",font=("Segoe UI",3))

# ════════════════════════════════════════════════════════
# 3 —  12 LEDs on breadboard (2 rows x 6)
# ════════════════════════════════════════════════════════
LD = 10                        # LED dome radius
LC = BX+60                    # first LED column X
LG = 86                       # column gap
R1Y = BY+110                  # row 1 center (top half)
R2Y = BY+170                  # row 2 center (top half)

led_domes = []
led_labels = []
resistors = []

for i in range(NS):
    col = i % 6
    row = 0 if i < 6 else 1
    cx = LC + col*LG
    cy = R1Y if row==0 else R2Y

    # LED dome — bigger, more realistic 5mm dome
    dome = rovl(cx-LD,cy-LD, cx+LD,cy+LD, fill="#003300", outline="#00ff44", width=3)
    # Glassy reflection (top-left)
    rovl(cx-5,cy-7, cx-1,cy-3, fill="white", outline="", stipple="gray25")
    # Secondary reflection
    rovl(cx+3,cy+2, cx+5,cy+4, fill="white", outline="", stipple="gray50")
    led_domes.append(dome)

    # Flat side (cathode mark)
    rlin(cx+8,cy-7,cx+8,cy+7, fill="#1a1a2e", width=3)

    # LED legs (thicker)
    rlin(cx-4,cy+LD,cx-4,cy+LD+10, fill="#aaa", width=2)  # anode
    rlin(cx+4,cy+LD,cx+4,cy+LD+8, fill="#aaa", width=2)   # cathode

    # Anode bend indicator
    rlin(cx-6,cy+LD+10,cx-2,cy+LD+10, fill="#aaa", width=2)

    # Slot label
    lbl = rtxt(cx,cy-LD-8, text=f"SLOT {i+1}", fill="#ccc",
               font=("Segoe UI",7,"bold"))
    led_labels.append(lbl)

    # ── Resistor (cylindrical, realistic) ──
    rx, ry = cx+40, cy+6
    # Body shadow
    rbox(rx-10,ry+1, rx+10,ry+14, fill="#b8946a", outline="")
    # Body
    res = rbox(rx-10,ry, rx+10,ry+13, fill="#d4a574", outline="#8b6914", width=1)
    # Color bands (each resistor unique)
    BANDS = [
        ["#8b4513","#000","#d00","#gold"], ["#d00","#000","#d00","#gold"],
        ["#ff8c00","#000","#d00","#gold"], ["#ffd700","#000","#d00","#gold"],
        ["#2ecc71","#000","#d00","#gold"], ["#3498db","#000","#d00","#gold"],
        ["#9b59b6","#000","#d00","#gold"], ["#555","#000","#d00","#gold"],
        ["#fff","#000","#d00","#gold"],    ["#8b4513","#000","#ff8c00","#gold"],
        ["#d00","#000","#ff8c00","#gold"],["#ff8c00","#000","#d00","#gold"],
    ]
    bands = BANDS[i%len(BANDS)]
    for bi,bc in enumerate(bands):
        if bc=="#gold": continue
        bx=rx-7+bi*5
        rbox(bx,ry+1,bx+3,ry+12, fill=bc, outline="")
    # Tolerance band (gold)
    rbox(rx+7,ry+1,rx+9,ry+12, fill="#d4af37", outline="")

    # End caps (silver)
    rbox(rx-12,ry+1,rx-10,ry+12, fill="#aaa", outline="")
    rbox(rx+10,ry+1,rx+12,ry+12, fill="#aaa", outline="")

    resistors.append(res)

    # Resistor legs
    rlin(rx-10,ry+6, rx-18,ry+6, fill="#aaa", width=2)
    rlin(rx+10,ry+6, rx+18,ry+6, fill="#aaa", width=2)

    # cathode -> resistor connection
    rlin(cx+4,cy+LD+8, rx-18,ry+6, fill="#aaa", width=2)

    # resistor -> GND rail (blue wire)
    rlin(rx+18,cy+20, BX+BW-60,cy+20, fill="#3498db", width=2)
    rtxt(rx+18,cy+24, text="GND", fill="#3498db", font=("Segoe UI",5))

# ════════════════════════════════════════════════════════
# 3b —  GPIO WIRING (THICK, COLORED, ORGANISED IN DUCT)
# ════════════════════════════════════════════════════════
# Wire duct channel between breadboard bottom and legend
DUCT_Y = 383
DUCT_H = 34

# Draw wire duct/trunk background
rbox(20, DUCT_Y, 860, DUCT_Y+DUCT_H, fill="#15151e", outline="#2a2a3e", width=2)
rbox(22, DUCT_Y+1, 858, DUCT_Y+DUCT_H-1, fill="#12121a", outline="")
rtxt(440, DUCT_Y+DUCT_H-8, text="[ WIRE DUCT — GPIO Bundle + Power ]",
     fill="#484f58", font=("Segoe UI",5))

# Trunk Y positions — staggered for each row
TRUNK_Y_R1 = DUCT_Y + 8    # Row 1 (slots 0-5)
TRUNK_Y_R2 = DUCT_Y + 24   # Row 2 (slots 6-11)

GPIO_COLORS = [
    "#ff3333","#ff8c00","#ffd700","#2ecc71",
    "#3498db","#9b59b6","#e74c3c","#1abc9c",
    "#f39c12","#e91e63","#00bcd4","#8e44ad",
]

for i in range(NS):
    col = i % 6
    row = 0 if i < 6 else 1
    cx = LC + col*LG
    cy = R1Y if row==0 else R2Y

    c = GPIO_COLORS[i%len(GPIO_COLORS)]

    # Pin Y on ESP32 (staggered across 12 pins)
    pin_y = EY + 44 + i * 8
    pin_y = min(pin_y, EY+EH-30)

    ESP_RIGHT = EX + EW + 2
    trunk_y = TRUNK_Y_R1 if row == 0 else TRUNK_Y_R2
    wire_x2 = cx - 4  # reaches LED anode

    # Route in 4 segments with clear right-angle bends
    mid_x = ESP_RIGHT + 12 + i * 2

    # Segment 1: right from ESP32
    rlin(ESP_RIGHT, pin_y, mid_x, pin_y, fill=c, width=3)
    # Segment 2: down to trunk
    rlin(mid_x, pin_y, mid_x, trunk_y, fill=c, width=3)
    # Segment 3: left across duct to LED column
    rlin(mid_x, trunk_y, wire_x2, trunk_y, fill=c, width=3)
    # Segment 4: up to LED anode
    rlin(wire_x2, trunk_y, wire_x2, cy+LD+5, fill=c, width=3)

    # ── Junction dots at each bend ──
    dot_r = 3
    # ESP32 exit dot
    rovl(ESP_RIGHT-2, pin_y-2, ESP_RIGHT+2, pin_y+2, fill=c, outline="#fff", width=1)
    # First bend (right then down)
    rovl(mid_x-2, pin_y-2, mid_x+2, pin_y+2, fill=c, outline="#fff", width=1)
    # Second bend (down then left)
    rovl(mid_x-2, trunk_y-2, mid_x+2, trunk_y+2, fill=c, outline="#fff", width=1)
    # Third bend (left then up)
    rovl(wire_x2-2, trunk_y-2, wire_x2+2, trunk_y+2, fill=c, outline="#fff", width=1)
    # LED entry dot
    rovl(wire_x2-2, cy+LD+3, wire_x2+2, cy+LD+7, fill=c, outline="#fff", width=1)

    # GPIO label near ESP32
    rtxt(mid_x+2, (pin_y+trunk_y)//2, text=f"GPIO{i+12}",
         fill=c, font=("Segoe UI",5,"bold"), anchor="w")

    # Wire label near LED
    rtxt(wire_x2-10, trunk_y-10, text=f"D{i+12}",
         fill=c, font=("Segoe UI",5), anchor="e")

# ════════════════════════════════════════════════════════
# 4 —  I2C LCD 16x2 (with I2C backpack)
# ════════════════════════════════════════════════════════
LX,LY,LW,LH = 850,44,210,55

# LCD frame (black border)
rbox(LX,LY,LX+LW,LY+LH, fill="#0a0a0a", outline="#333", width=3)
# LCD screen
rbox(LX+6,LY+6,LX+LW-6,LY+LH-6, fill="#001800", outline="#004400", width=2)
lcd_t1 = rtxt(LX+LW//2,LY+20, text=" IoT Parking Sys", fill="#00ff88",
              font=("Courier New",10,"bold"))
lcd_t2 = rtxt(LX+LW//2,LY+38, text=" Free: 12/12 slots", fill="#00ff88",
              font=("Courier New",10,"bold"))

# I2C backpack (module on the right edge)
rbox(LX+LW-6,LY+8,LX+LW+14,LY+LH-8, fill="#222", outline="#555", width=1)
rtxt(LX+LW+4,LY+LH//2, text="I2C", fill="#888", font=("Segoe UI",5))

# LCD label
rtxt(LX+LW//2,LY-8, text="LCD 16x2 I2C (Address 0x27)", fill="#8b949e",
      font=("Segoe UI",6))

# SDA / SCL wires from ESP32 to LCD
SDA_Y = EY + 118
SCL_Y = EY + 130

rlin(EX+EW+2,SDA_Y, LX-10,SDA_Y, LX-10,LY+16, fill="#f0883e", width=3)
rtxt(LX-12,LY+14, text="SDA", fill="#f0883e", font=("Segoe UI",5,"bold"))

rlin(EX+EW+2,SCL_Y, LX-10,SCL_Y, LX-10,LY+34, fill="#e67e22", width=3)
rtxt(LX-12,LY+32, text="SCL", fill="#e67e22", font=("Segoe UI",5,"bold"))

# ════════════════════════════════════════════════════════
# 5 —  I2C WIRING LABELS
# ════════════════════════════════════════════════════════
rtxt(EX+EW+2+10, SDA_Y-8, text="I2C Bus (SDA/SCL)", fill="#f0883e",
      font=("Segoe UI",5))

# ════════════════════════════════════════════════════════
# 6 —  SG90 SERVO MOTORS
# ════════════════════════════════════════════════════════
# Entry Gate Servo
SE_X,SE_Y=18,296
# Body
rbox(SE_X,SE_Y,SE_X+72,SE_Y+38, fill="#1a1a2e", outline="#888", width=2)
rbox(SE_X+1,SE_Y+1,SE_X+71,SE_Y+37, fill="#222244", outline="")
# Servo model
rtxt(SE_X+36,SE_Y+11, text="SG90", fill="#f0883e", font=("Segoe UI",7,"bold"))
sv_e_txt = rtxt(SE_X+36,SE_Y+23, text="CLOSED", fill="#555",
                font=("Segoe UI",6))

# Shaft (silver)
rovl(SE_X+30,SE_Y-6,SE_X+40,SE_Y+4, fill="#aaa", outline="#ccc", width=1)
# Shaft rotation indicator
sv_e_line = rlin(SE_X+35,SE_Y-1, SE_X+45,SE_Y-7, fill="#ccc", width=3)

# Mounting ears
rbox(SE_X-8,SE_Y+5,SE_X,SE_Y+12, fill="#1a1a2e", outline="#888", width=1)
rbox(SE_X+72,SE_Y+5,SE_X+80,SE_Y+12, fill="#1a1a2e", outline="#888", width=1)

# Servo horn (arm)
rlin(SE_X+50,SE_Y+19, SE_X+72,SE_Y+19, fill="#f0883e", width=3)

# 3-pin header (PWM, VCC, GND)
for pi,pc in enumerate(["#f0883e","#e74c3c","#3498db"]):
    px=SE_X+14+pi*16
    rovl(px,SE_Y+40, px+3,SE_Y+43, fill=pc, outline="")
rtxt(SE_X+36,SE_Y+48, text="PWM VCC GND", fill="#888", font=("Segoe UI",5))

# Entry label
rtxt(SE_X+36,SE_Y-10, text="ENTRY GATE", fill="#00ff44", font=("Segoe UI",7,"bold"))

# Exit Gate Servo
SX_X,SX_Y=SE_X+88,SE_Y
rbox(SX_X,SX_Y,SX_X+72,SX_Y+38, fill="#1a1a2e", outline="#888", width=2)
rbox(SX_X+1,SX_Y+1,SX_X+71,SX_Y+37, fill="#222244", outline="")
rtxt(SX_X+36,SX_Y+11, text="SG90", fill="#f0883e", font=("Segoe UI",7,"bold"))
sv_x_txt = rtxt(SX_X+36,SX_Y+23, text="CLOSED", fill="#555",
                font=("Segoe UI",6))

rovl(SX_X+30,SX_Y-6,SX_X+40,SX_Y+4, fill="#aaa", outline="#ccc", width=1)
sv_x_line = rlin(SX_X+35,SX_Y-1, SX_X+45,SX_Y-7, fill="#ccc", width=3)

rbox(SX_X-8,SX_Y+5,SX_X,SX_Y+12, fill="#1a1a2e", outline="#888", width=1)
rbox(SX_X+72,SX_Y+5,SX_X+80,SX_Y+12, fill="#1a1a2e", outline="#888", width=1)
rlin(SX_X+50,SX_Y+19, SX_X+72,SX_Y+19, fill="#f0883e", width=3)

rtxt(SX_X+36,SX_Y-10, text="EXIT GATE", fill="#ff4444", font=("Segoe UI",7,"bold"))

# Servo PWM wires from ESP32 left side
# Entry servo PWM -> ESP32 D12
rlin(EX+5,EY+44+8*12, EX-10,EY+44+8*12, EX-10,SE_Y+41, SE_X+14,SE_Y+41,
     fill="#f0883e", width=3)

# Exit servo PWM -> ESP32 D13
rlin(EX+5,EY+44+8*13, EX-10,EY+44+8*13, EX-10,SX_Y+41, SX_X+14,SX_Y+41,
     fill="#f0883e", width=3)

# ════════════════════════════════════════════════════════
# 7 —  IR SENSORS
# ════════════════════════════════════════════════════════
IR1_X,IR1_Y=18,362
rbox(IR1_X,IR1_Y, IR1_X+44,IR1_Y+18, fill="#1a1a1a", outline="#f0883e", width=2)
# IR LED emitter (2 dots)
rovl(IR1_X+8,IR1_Y+4, IR1_X+12,IR1_Y+8, fill="#ff4444", outline="")
rovl(IR1_X+32,IR1_Y+4, IR1_X+36,IR1_Y+8, fill="#333", outline="")
rtxt(IR1_X+22,IR1_Y+9, text="IR-E", fill="#f0883e", font=("Segoe UI",6,"bold"))
rtxt(IR1_X+22,IR1_Y-6, text="ENTRY", fill="#00ff44", font=("Segoe UI",6,"bold"))

IR2_X,IR2_Y=IR1_X+60,IR1_Y
rbox(IR2_X,IR2_Y, IR2_X+44,IR2_Y+18, fill="#1a1a1a", outline="#f0883e", width=2)
rovl(IR2_X+8,IR2_Y+4, IR2_X+12,IR2_Y+8, fill="#ff4444", outline="")
rovl(IR2_X+32,IR2_Y+4, IR2_X+36,IR2_Y+8, fill="#333", outline="")
rtxt(IR2_X+22,IR2_Y+9, text="IR-X", fill="#f0883e", font=("Segoe UI",6,"bold"))
rtxt(IR2_X+22,IR2_Y-6, text="EXIT", fill="#ff4444", font=("Segoe UI",6,"bold"))

# IR wires from ESP32 left pins
# Entry IR (D4 / D5 on ESP32 left side)
rlin(EX+5,EY+44+8*4, EX-10,EY+44+8*4, EX-10,IR1_Y+9, IR1_X-3,IR1_Y+9,
     fill="#6b8e23", width=3)
rtxt(EX-12,IR1_Y+7, text="TRIG", fill="#6b8e23", font=("Segoe UI",5))

rlin(EX+5,EY+44+8*5, EX-10,EY+44+8*5, EX-10,IR2_Y+9, IR2_X-3,IR2_Y+9,
     fill="#556b2f", width=3)
rtxt(EX-12,IR2_Y+7, text="ECHO", fill="#556b2f", font=("Segoe UI",5))

# ════════════════════════════════════════════════════════
# 8 —  HC-SR04 ULTRASONIC + BUZZER + POT
# ════════════════════════════════════════════════════════
# HC-SR04 on breadboard right side
US_X,US_Y = BX+BW-80, BY+240
rbox(US_X,US_Y,US_X+65,US_Y+24, fill="#1a1a1a", outline="#888", width=2)
# Transducer eyes
rovl(US_X+16,US_Y-2,US_X+23,US_Y+5, fill="#555", outline="#888", width=1)
rovl(US_X+42,US_Y-2,US_X+49,US_Y+5, fill="#555", outline="#888", width=1)
rtxt(US_X+32,US_Y+8, text="HC-SR04", fill="#888", font=("Segoe UI",5))
rtxt(US_X+32,US_Y+16, text="Ultrasonic", fill="#555", font=("Segoe UI",4))

# Buzzer
BZ_X,BZ_Y = US_X-40, US_Y-16
rovl(BZ_X-10,BZ_Y-8, BZ_X+10,BZ_Y+8, fill="#1a1a1a", outline="#f0883e", width=2)
rovl(BZ_X-5,BZ_Y-4, BZ_X+5,BZ_Y+4, fill="#333", outline="")
rlin(BZ_X-7,BZ_Y, BZ_X+7,BZ_Y, fill="#f0883e", width=2)
rtxt(BZ_X,BZ_Y+14, text="BUZZER", fill="#f0883e", font=("Segoe UI",5))

# Potentiometer
POT_X,POT_Y = BX+BW//2, BY-12
rovl(POT_X-10,POT_Y-10, POT_X+10,POT_Y+10, fill="#222", outline="#d2a8ff", width=2)
rlin(POT_X,POT_Y-10, POT_X,POT_Y, fill="#d2a8ff", width=3)
rtxt(POT_X,POT_Y+16, text="POT (Slot Select)", fill="#d2a8ff", font=("Segoe UI",5))

# ════════════════════════════════════════════════════════
# 9 —  POWER WIRING FROM ESP32
# ════════════════════════════════════════════════════════
# 3.3V from ESP32 to breadboard (+) rail
rlin(EX+EW+2,EY+44+8*9, 680,EY+44+8*9, 680,BY+23, BX+60,BY+23,
     fill="#e74c3c", width=3)
rtxt(640,EY+44+8*9-6, text="3.3V POWER", fill="#e74c3c",font=("Segoe UI",5,"bold"))

# GND from ESP32 to breadboard (-) rail
rlin(EX+EW+2,EY+44+8*10, 700,EY+44+8*10, 700,BY+37, BX+60,BY+37,
     fill="#3498db", width=3)
rtxt(660,EY+44+8*10-6, text="GND", fill="#3498db",font=("Segoe UI",5,"bold"))

# ════════════════════════════════════════════════════════
# 10 —  COMPONENT LEGEND
# ════════════════════════════════════════════════════════
LG_Y = 470
rbox(10,LG_Y,W-10,LG_Y+80, fill="#0a0a14", outline="#333", width=1)
rtxt(20,LG_Y+8, text="LEGEND", fill="#484f58", font=("Segoe UI",7,"bold"))

LEG = [
    (20,LG_Y+24,"#00ff44","Green LED = Empty slot","#00ff44","Oval"),
    (250,LG_Y+24,"#ff8800","Orange LED = Booked slot","#ff8800","Oval"),
    (480,LG_Y+24,"#ff3333","Red LED = Occupied slot","#ff3333","Oval"),
    (710,LG_Y+24,"#e74c3c","Red wire = VCC / Power","#e74c3c","Line"),
    (20,LG_Y+42,"#3498db","Blue wire = GND","#3498db","Line"),
    (250,LG_Y+42,"#f0883e","Orange wire = Servo PWM / I2C","#f0883e","Line"),
    (480,LG_Y+42,"#ff3333","Thick color = GPIO signal wires","#ff3333","Line"),
    (710,LG_Y+42,"#6b8e23","Green wire = Sensor TRIG/ECHO","#6b8e23","Line"),
    (20,LG_Y+60,"#58a6ff","GPIO = General Purpose I/O","#58a6ff","Line"),
    (250,LG_Y+60,"#f0883e","POT = Potentiometer (slot selection)","#d2a8ff","Line"),
    (480,LG_Y+60,"#aaa","SG90 = Micro servo motor","#f0883e","Line"),
    (710,LG_Y+60,"#888","HC-SR04 = Ultrasonic sensor","#888","Line"),
]

for lx,ly,color,label,swatch,stype in LEG:
    if stype=="Oval":
        rovl(lx,ly-4, lx+10,ly+4, fill=color, outline=color)
    else:
        rlin(lx,ly, lx+10,ly, fill=color, width=3)
    rtxt(lx+14,ly, text=label, fill="#8b949e", font=("Segoe UI",6), anchor="w")

# ════════════════════════════════════════════════════════
# 11 —  SLOT STATUS TABLE
# ════════════════════════════════════════════════════════
ST_Y = 560
rbox(8,ST_Y,W-8,ST_Y+65, fill="#0a0a14", outline="#222", width=1)
rtxt(W//2,ST_Y+10, text="PARKING SLOT STATUS MONITOR",
     fill="#484f58", font=("Segoe UI",7,"bold"))

sbox = []; stxt = []; sreg = []
SX0 = 20
BW_s, BH_s, BG = 78, 30, 4

for i in range(NS):
    bx = SX0 + i*(BW_s+BG)
    by = ST_Y + 20
    box = rbox(bx,by, bx+BW_s,by+BH_s, fill="#0a0a14", outline="#333", width=1)
    sbox.append(box)
    rtxt(bx+12, by+BH_s//2, text=f"S{i+1}", fill="#8b949e",
         font=("Segoe UI",6,"bold"))
    st = rtxt(bx+BW_s//2+6, by+BH_s//2, text="--", fill="#555",
              font=("Segoe UI",6,"bold"))
    stxt.append(st)
    rt = rtxt(bx+BW_s//2, by+BH_s+10, text="", fill="#555",
              font=("Segoe UI",5))
    sreg.append(rt)

# Status bars
stat_bar = rtxt(20, 640, text="", fill="#8b949e", font=("Segoe UI",8), anchor="w")
stat_rt = rtxt(W-20, 640, text="", fill="#8b949e", font=("Segoe UI",8), anchor="e")

# Instructions
INSTR_Y = 665
rbox(8,INSTR_Y-4,W-8,INSTR_Y+30, fill="#0a0a14", outline="#222", width=1)
rtxt(W//2,INSTR_Y+2,text="CLICK a slot to select  |  Click [IR-E] to enter a car  |  Click [IR-X] to remove selected slot  |  Turn POT to browse",
     fill="#484f58",font=("Segoe UI",7))
rtxt(W//2,INSTR_Y+16,text="WebSocket live sync · HTTP polling every 4s · Revenue auto-updates",
     fill="#333",font=("Segoe UI",6))

# Connect / sync status
rtxt(W//2,INSTR_Y+28,text="Waiting for server...   |   Middle-drag to pan · Scroll to zoom · Ctrl+0 to reset view",
     fill="#555",font=("Segoe UI",6))

# ════════════════════════════════════════════════════════
# UI UPDATE
# ════════════════════════════════════════════════════════
def update_ui():
    for i in range(NS):
        if slots[i]:
            color="#ff3333"; status="OCCUPIED"; bg="#1a0505"
        elif slot_booked[i]:
            color="#ff8800"; status="BOOKED"; bg="#1a0f00"
        else:
            color="#00ff44"; status="EMPTY"; bg="#051a05"
        cv.itemconfig(sbox[i],fill=bg,outline=color)
        cv.itemconfig(stxt[i],text=status,fill=color)
        cv.itemconfig(led_domes[i],fill=color,outline=color)
        cv.itemconfig(sreg[i],text=slot_regs[i] or "")

    cv.itemconfig(conn_dot,fill="#2ecc71" if svOk else "#e74c3c")
    cv.itemconfig(conn_txt,text="Connected" if svOk else "Disconnected",
                  fill="#2ecc71" if svOk else "#e74c3c")

    occ=sum(slots); bk=sum(slot_booked); free=NS-occ-bk
    cv.itemconfig(stat_bar,
        text=f"Server: {'ONLINE' if svOk else 'OFFLINE'}  |  Occupied: {occ}  |  Booked: {bk}  |  Free: {free}  |  Total sessions: {tSes}")
    cv.itemconfig(stat_rt,text=f"Revenue: £{tRev}")

    cv.itemconfig(sv_e_txt,text="OPEN" if gateE_open else "CLOSED",
                  fill="#2ecc71" if gateE_open else "#e74c3c")
    cv.itemconfig(sv_x_txt,text="OPEN" if gateX_open else "CLOSED",
                  fill="#2ecc71" if gateX_open else "#e74c3c")
    cv.itemconfig(lcd_t1,text=lcd1.ljust(16)[:16] if lcd1 else " IoT Parking Sys")
    cv.itemconfig(lcd_t2,text=lcd2.ljust(16)[:16] if lcd2 else " Free: 12/12 slots")

def lcd_show(a,b):
    global lcd1,lcd2
    lcd1=a.ljust(16)[:16]; lcd2=b.ljust(16)[:16]
    cv.itemconfig(lcd_t1,text=lcd1); cv.itemconfig(lcd_t2,text=lcd2)

def update_lcd():
    free=NS-sum(slots)-sum(slot_booked)
    sv="ON" if svOk else "OFF"
    md=int(time.time()//3)%4
    msgs=[
        (" IoT Parking Sys",f" Free: {free}/{NS} sl"),
        (" Press [IR-E] for"," car arrival..."),
        (" Turn POT to sel"," slot -> [IR-X]"),
        (f" {tSes} cars | Rev:{tRev}",f" Svr:{sv}"),
    ]
    lcd_show(msgs[md][0],msgs[md][1])
    root.after(3000,update_lcd)

# ════════════════════════════════════════════════════════
# HANDLERS
# ════════════════════════════════════════════════════════
car_cnt=[1]
MODELS=["Toyota Camry","Honda Civic","Hyundai i20","Maruti Swift",
        "Tata Nexon","Mahindra XUV","Kia Seltos","VW Polo","BMW 3 Series"]

def gate_on(gate,on):
    global gateE_open,gateX_open
    if gate=="entry":
        gateE_open=on
        cv.itemconfig(sv_e_txt,text="OPEN" if on else "CLOSED",
                      fill="#2ecc71" if on else "#e74c3c")
    else:
        gateX_open=on
        cv.itemconfig(sv_x_txt,text="OPEN" if on else "CLOSED",
                      fill="#2ecc71" if on else "#e74c3c")

def on_entry():
    global tSes
    if not svOk:
        lcd_show("Server Down!   ","Check WiFi/URL  ")
        root.after(2000,update_lcd); return
    if sum(slots)>=NS:
        lcd_show("Parking FULL!  ","No spaces left  ")
        root.after(2000,update_lcd); return
    lcd_show("Car detected!  ","Contacting srv..")
    reg=f"CKT-{car_cnt[0]:03d}"; car_cnt[0]+=1
    mod=MODELS[hash(reg)%len(MODELS)]
    d=http_post("/api/parking/entry",{"car_registration":reg,"car_model":mod,"owner_name":"Circuit"})
    if d and "slot_number" in d:
        sn=d["slot_number"]
        if 1<=sn<=NS:
            slots[sn-1]=True; slot_regs[sn-1]=reg; tSes+=1
            gate_on("entry",True)
            lcd_show(f"Slot {sn} assign!",f"{reg} at gate...")
            root.after(2500,lambda:gate_on("entry",False))
            root.after(3000,update_lcd); update_ui(); return
    lcd_show("Server error!  ","Try again...    ")
    root.after(2000,update_lcd); update_ui()

def on_exit():
    global tRev
    if not svOk:
        lcd_show("Server Down!   ","Check WiFi/URL  ")
        root.after(2000,update_lcd); return
    if not slots[selSlot]:
        lcd_show(f"Slot {selSlot+1} empty!","Select another...")
        root.after(1500,update_lcd); return
    reg=slot_regs[selSlot]
    if not reg:
        lcd_show("No reg found!  ","Use web UI...   ")
        root.after(1500,update_lcd); return
    lcd_show(f"Slot {selSlot+1}: exit",f"{reg} leaving...")
    d=http_post("/api/parking/exit",{"car_registration":reg})
    fee=(d.get("amount_charged") or 5) if d else 5
    tRev+=int(fee)
    slots[selSlot]=False; slot_regs[selSlot]=None
    gate_on("exit",True)
    lcd_show(f"Slot {selSlot+1} free",f"Fee: £{int(fee)}" if fee else "Paid via pre-book")
    root.after(2500,lambda:gate_on("exit",False))
    root.after(3000,update_lcd); update_ui()

def click(ev):
    """Transform event coords -> base coords (accounting for zoom & pan)."""
    x = int((ev.x - pan_x) / (S * zoom_level))
    y = int((ev.y - pan_y) / (S * zoom_level))

    if IR1_X<=x<=IR1_X+44 and IR1_Y<=y<=IR1_Y+18:
        on_entry()
    elif IR2_X<=x<=IR2_X+44 and IR2_Y<=y<=IR2_Y+18:
        on_exit()
    elif (x-POT_X)**2+(y-POT_Y)**2<14**2:
        pct=max(0,min(1,(x-200)/600))
        global selSlot
        selSlot=int(pct*NS)%NS
        st="OCC" if slots[selSlot] else ("BKD" if slot_booked[selSlot] else "EMP")
        reg=slot_regs[selSlot] or "---"
        lcd_show(f"Slot {selSlot+1}: {st}",f"    Reg: {reg}")
    else:
        for i in range(NS):
            bx=SX0+i*(BW_s+BG); by=ST_Y+20
            if bx<=x<=bx+BW_s and by<=y<=by+BH_s:
                selSlot=i
                st="OCC" if slots[i] else ("BKD" if slot_booked[i] else "EMP")
                reg=slot_regs[i] or "---"
                lcd_show(f"Slot {i+1}: {st}",f"    Reg: {reg}")
                break

cv.bind("<Button-1>",click)

# ── Reset view (Ctrl+0) — undo move first, then scale ──
def reset_view(ev=None):
    global zoom_level, pan_x, pan_y
    cv.move("all", -pan_x, -pan_y)
    cv.scale("all", 0, 0, 1/zoom_level, 1/zoom_level)
    zoom_level = 1.0
    pan_x = 0.0
    pan_y = 0.0
    # Update zoom indicator
    cv.itemconfig(zoom_indicator, text="Zoom: 100%")
root.bind("<Control-Key-0>", reset_view)

# ════════════════════════════════════════════════════════
# POLL + BOOT
# ════════════════════════════════════════════════════════
def poll():
    while True:
        time.sleep(4); sync()

root.after(500,lambda:(sync(),update_ui()))
root.after(1000,update_lcd)
threading.Thread(target=poll,daemon=True).start()
threading.Thread(target=ws_listen,daemon=True).start()
root.mainloop()
