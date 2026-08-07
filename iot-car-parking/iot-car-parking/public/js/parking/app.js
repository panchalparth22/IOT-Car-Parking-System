// ─── REACT APP ────────────────────────────────────────────
import Parking3D from './parking3d.js';
import { NS, MODELS, slotPos } from './constants.js';
import { apiGet, apiPost } from './api.js';

const { useState, useEffect, useRef, useCallback, createElement: h } = React;
const ReactDOM = window.ReactDOM;

function App() {
  const cnv = useRef(null);
  const s3d = useRef(null);
  const [slots, setSlots] = useState(Array(NS).fill(false));
  const [regs, setRegs] = useState(Array(NS).fill(null));
  const [svOk, setSvOk] = useState(false);
  const [tSes, setTSes] = useState(0);
  const [tRev, setTRev] = useState(0);
  const [sel, setSel] = useState(null);
  const [anim, setAnim] = useState(false);
  const [lcd, setLcd] = useState('⏳ Loading 3D...');
  const [toast, setToast] = useState(null);
  const [ready, setReady] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [booked, setBooked] = useState(Array(NS).fill(false));
  const [bookingsData, setBookingsData] = useState([]);
  const cnt = useRef(1);
  const autoTimers = useRef({});
  const wsRef = useRef(null);

  const notify = (msg, type) => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  // Init 3D once
  useEffect(() => {
    if (!cnv.current || s3d.current) return;
    const s = new Parking3D(cnv.current, msg => setLcd(msg));
    s3d.current = s;
    setReady(true);
    setLcd('🚗 IoT Parking · Syncing...');

    // WebSocket for real-time events
    const wsUrl = 'ws://' + location.host;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'booking-arriving' || msg.type === 'entry' || msg.type === 'booking' || msg.type === 'slots-update') {
          setTimeout(() => sync(), msg.type === 'booking-arriving' ? 200 : 800);
        }
      } catch (_) {}
    };
    ws.onclose = () => { if (wsRef.current === ws) wsRef.current = null; };

    // Seed car counter from server data
    apiGet('/api/parking/slots').then(d => {
      if (d && d.slots) {
        let max = 0;
        d.slots.forEach(sl => {
          if (sl.car?.car_registration) {
            const m = parseInt(sl.car.car_registration.replace(/\D/g, ''), 10);
            if (m > max) max = m;
          }
        });
        cnt.current = max + 1;
      }
    });
    const onR = () => {
      const p = cnv.current.parentElement;
      if (p) s.resize(p.clientWidth, p.clientHeight);
    };
    window.addEventListener('resize', onR);
    setTimeout(onR, 50);
    return () => {
      window.removeEventListener('resize', onR);
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    };
  }, []);

  useEffect(() => {
    if (s3d.current) {
      s3d.current.setSlots(slots, sel, booked);
      s3d.current.syncCars(slots, regs);
    }
  }, [slots, sel, booked, regs]);

  // Sync server
  const sync = useCallback(async () => {
    const d = await apiGet('/api/parking/slots');
    if (d && d.slots) {
      setSvOk(true);
      const s = [], r = [], b = []; let n = 0;
      const bks = [];

      d.slots.forEach(sl => {
        const i = sl.slot_number - 1, o = sl.status === 'occupied', bk = sl.status === 'booked';
        s[i] = o; r[i] = o ? (sl.car?.car_registration || null) : null;
        b[i] = bk;
        if (o) n++;
        if (bk && sl.booking) bks.push(sl.booking);
      });

      setSlots(s); setRegs(r); setTSes(n);
      setBooked(b); setBookingsData(bks);
    } else {
      setSvOk(false);
    }
  }, []);
  useEffect(() => { sync(); const id = setInterval(sync, 4000); return () => clearInterval(id); }, [sync]);

  // Auto-park for pre-booked slots
  const autoPark = useCallback(async (booking) => {
    const { slot_number, car_registration, car_model, owner_name, booking_reference } = booking;
    if (!slot_number || !car_registration) return;

    setLcd(`📡 ${car_registration} · Booked arrival in progress...`);
    await apiPost(`/api/bookings/${booking_reference}/arrive`, {});

    const d = await apiPost('/api/parking/entry', {
      car_registration,
      car_model: car_model || 'Unknown',
      owner_name: owner_name || '3D',
      slot_number,
    });

    if (d && d.slot_number) {
      const sn = d.slot_number;
      setSlots(p => { const n = [...p]; n[sn - 1] = true; return n; });
      setRegs(p => { const n = [...p]; n[sn - 1] = car_registration; return n; });
      setBooked(p => { const n = [...p]; n[sn - 1] = false; return n; });
      setTSes(p => p + 1);
      setLcd(`✅ Pre-booked ${car_registration} → Slot #${sn}`);
      notify(`📌 ${car_registration} arrived (pre-booked #${sn})`, 'go');
      if (s3d.current) {
        s3d.current.playEntry(sn - 1,
          () => { setAnim(false); setLcd(`✅ ${car_registration} parked at #${sn}`); setAnim(false); },
          (phase) => {
            if (phase === 'scan') {
              setScanning(true);
              setLcd(`📡 ${car_registration} · Scanning at gate...`);
              setTimeout(() => { setLcd(`✅ ${car_registration} · Clear!`); setScanning(false); }, 1000);
            }
          }
        );
      } else {
        setAnim(false);
      }
    }
  }, [setSlots, setRegs, setBooked, setTSes, setLcd, setScanning, notify, s3d]);

  // Watch bookings and set arrival timers
  useEffect(() => {
    const now = Date.now();
    bookingsData.forEach(b => {
      if (b.status === 'confirmed' && !autoTimers.current[b.booking_reference]) {
        const createdMs = new Date(b.created_at).getTime();
        const arrivalMs = createdMs + b.arrival_delay_seconds * 1000;
        const remaining = Math.max(0, arrivalMs - now);
        if (remaining <= 100) {
          autoTimers.current[b.booking_reference] = setTimeout(() => {
            delete autoTimers.current[b.booking_reference];
            autoPark(b);
          }, remaining + 50);
        } else {
          autoTimers.current[b.booking_reference] = setTimeout(() => {
            delete autoTimers.current[b.booking_reference];
            autoPark(b);
          }, remaining);
        }
      }
    });
    return () => {
      const activeRefs = new Set(bookingsData.filter(b => b.status === 'confirmed').map(b => b.booking_reference));
      Object.keys(autoTimers.current).forEach(ref => {
        if (!activeRefs.has(ref)) {
          clearTimeout(autoTimers.current[ref]);
          delete autoTimers.current[ref];
        }
      });
    };
  }, [bookingsData, autoPark]);

  // LCD rotation
  useEffect(() => {
    if (anim || scanning) return;
    const free = slots.filter((s, i) => !s && !booked[i]).length;
    const msgs = [
      `🚗 IoT Parking · Free: ${free}/${NS} · Rev: £${tRev}`,
      `🅿️  Click a slot → Park or Remove · ${tSes} cars today`,
      `🔴 Server: ${svOk ? 'Connected' : 'OFFLINE'}`,
    ];
    const id = setInterval(() => {
      if (anim || scanning) return;
      setLcd(msgs[Math.floor(Date.now() / 3000) % 3]);
    }, 3000);
    return () => clearInterval(id);
  }, [slots, tRev, svOk, tSes, anim, scanning, booked]);

  const park = useCallback(async (idx) => {
    if (anim || !svOk || slots[idx]) return;
    setAnim(true);
    const reg = `CAR-${String(cnt.current++).padStart(3, '0')}`;
    const mod = MODELS[reg.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % MODELS.length];
    setLcd(`📡 ${reg} · Contacting server...`);
    const d = await apiPost('/api/parking/entry', { car_registration: reg, car_model: mod, owner_name: '3D' });
    if (d && d.slot_number) {
      const sn = d.slot_number;
      setSlots(p => { const n = [...p]; n[sn - 1] = true; return n; });
      setRegs(p => { const n = [...p]; n[sn - 1] = reg; return n; });
      setTSes(p => p + 1);
      setLcd(`✅ Slot #${sn} · Gate opening...`);
      notify(`🚗 ${reg} → Slot #${sn}`, 'go');
      if (s3d.current) {
        s3d.current.playEntry(sn - 1,
          () => { setAnim(false); setLcd(`✅ ${reg} parked at #${sn}`); },
          (phase) => {
            if (phase === 'scan') {
              setScanning(true);
              setLcd(`📡 ${reg} · Scanning at gate...`);
              setTimeout(() => {
                setLcd(`✅ ${reg} · Clear! Proceeding...`);
                setScanning(false);
              }, 1000);
            }
          }
        );
      } else { await new Promise(r => setTimeout(r, 3000)); setAnim(false); }
    } else {
      setLcd('❌ Server error'); notify('Server error!', 'warn');
      await new Promise(r => setTimeout(r, 1500)); setAnim(false);
    }
  }, [slots, svOk, anim]);

  const exitCar = useCallback(async () => {
    if (anim || sel === null || !slots[sel]) return;
    setAnim(true);
    const reg = regs[sel];
    if (!reg) { setLcd('⚠️ No data'); setAnim(false); return; }
    setLcd(`📡 ${reg} · Processing exit...`);
    const d = await apiPost('/api/parking/exit', { car_registration: reg });
    const fee = d?.amount_charged || 5;
    setTRev(p => p + fee);
    setLcd(fee > 0 ? `✅ Fee: £${fee} · Gate opening...` : '✅ Pre-booked (paid £7) · Gate opening...');
    notify(fee > 0 ? `🚙 ${reg} — Paid £${fee}` : `🚙 ${reg} — Pre-booked exit`, 'out');
    if (s3d.current) {
      s3d.current.playExit(sel,
        () => {
          setSlots(p => { const n = [...p]; n[sel] = false; return n; });
          setRegs(p => { const n = [...p]; n[sel] = null; return n; });
          setSel(null); setAnim(false);
          setLcd(`✅ Slot #${sel + 1} is now free`);
        },
        (phase) => {
          if (phase === 'scan') {
            setScanning(true);
            setLcd(`📡 ${reg} · Scanning at exit gate...`);
            setTimeout(() => {
              setLcd(`✅ ${reg} · Clear!`);
              setScanning(false);
            }, 1000);
          }
        }
      );
    } else {
      await new Promise(r => setTimeout(r, 3000));
      setSlots(p => { const n = [...p]; n[sel] = false; return n; });
      setSel(null); setAnim(false);
    }
  }, [slots, regs, sel, svOk, anim]);

  // Hide loading after ready
  useEffect(() => {
    if (ready) {
      const el = document.getElementById('loading');
      if (el) el.classList.add('s');
    }
  }, [ready]);

  const free = slots.filter((s, i) => !s && !booked[i]).length;
  const occ = NS - free - booked.filter(Boolean).length;

  return h('div', { style: { width: '100vw', height: '100vh', position: 'relative' } }, [
    toast && h('div', { className: `toast ${toast.type}`, key: Date.now() }, toast.msg),

    // HUD
    h('div', { className: 'hud' }, [
      h('div', { className: 'hl' }, [
        h('div', { className: 'ht' }, ['🚗 ', h('s', {}, 'Night Park')]),
        h('a', { href: '/booking-portal.html', style: { color: '#d29922', textDecoration: 'none', fontSize: 12, marginLeft: 10, border: '1px solid #30363d', borderRadius: 4, padding: '2px 8px' } }, '📌 Book'),
        h('div', { className: `st ${svOk ? 'on' : 'off'}` }, [h('span', { className: 'b' }), svOk ? 'Live' : 'Offline']),
      ]),
      h('div', { className: 'hr' }, [
        h('div', { className: 'sc' }, [h('div', { className: 'v', style: { color: '#2ea043' } }, free), h('div', { className: 'l' }, 'Free')]),
        h('div', { className: 'sc' }, [h('div', { className: 'v', style: { color: '#d29922' } }, booked.filter(Boolean).length), h('div', { className: 'l' }, 'Book')]),
        h('div', { className: 'sc' }, [h('div', { className: 'v', style: { color: '#f85149' } }, occ), h('div', { className: 'l' }, 'Occ')]),
        h('div', { className: 'sc' }, [h('div', { className: 'v', style: { color: '#58a6ff' } }, tSes), h('div', { className: 'l' }, 'Cars')]),
        h('div', { className: 'sc' }, [h('div', { className: 'v', style: { color: '#ffd700' } }, `£${tRev}`), h('div', { className: 'l' }, 'Rev')]),
      ]),
    ]),

    // Side panel
    h('div', { className: 'side' }, [
      h('div', { className: 'sh' }, '🅿️ Slots'),
      h('div', { className: 'g' },
        Array.from({ length: NS }, (_, i) => {
          const isBooked = booked[i] && !slots[i];
          const cl = `d${slots[i] ? ' oc' : isBooked ? ' bk' : ' fr'}${sel === i ? ' sl' : ''}`;
          const icon = slots[i] ? '🔴' : isBooked ? '🟠' : '🟢';
          return h('div', { key: i, className: cl, onClick: () => setSel(sel === i ? null : i) }, [`#${i + 1}`, h('br'), icon]);
        })
      ),
      h('div', { className: 'rn' }, [
        h('div', {}, [
          h('s', { style: { color: '#2ea043' } }, `${free} Free`),
          h('s', { style: { color: '#888' } }, ' · '),
          h('s', { style: { color: '#d29922' } }, `${booked.filter(Boolean).length} Book`),
          h('s', { style: { color: '#888' } }, ' · '),
          h('s', { style: { color: '#f85149' } }, `${occ} Occ`),
        ]),
        `🔄 ${tSes} total`,
      ]),
    ]),

    // Info
    sel !== null && h('div', { className: 'info' }, [
      h('div', {}, ['Selected: ', h('b', {}, `Slot #${sel + 1}`), slots[sel] ? `  🔴 ${regs[sel] || 'Car'}` : '  🟢 Free']),
      slots[sel] && h('div', { className: 'sm' }, ['Press REMOVE to exit car']),
    ]),

    // Canvas
    h('div', { style: { position: 'absolute', inset: 0, cursor: 'grab' } },
      h('canvas', { ref: cnv, style: { display: 'block', width: '100%', height: '100%' } })
    ),

    // LCD
    h('div', { className: 'lcd', style: { opacity: anim ? 0.75 : 1 } }, lcd),

    // Controls
    h('div', { className: 'btm' }, [
      h('button', {
        className: 'cb p', disabled: !svOk || free === 0 || anim || scanning,
        onClick: () => {
          let nearest = -1, minDist = Infinity;
          for (let i = 0; i < NS; i++) {
            if (!slots[i] && !booked[i]) {
              const { x, z } = slotPos(i);
              const dist = Math.abs(x) + Math.abs(z + 1.5);
              if (dist < minDist) { minDist = dist; nearest = i; }
            }
          }
          if (nearest >= 0) park(nearest);
        },
      }, '🅿️ Park'),
      h('button', {
        className: 'cb e', disabled: !svOk || sel === null || !slots[sel] || anim || scanning,
        onClick: exitCar,
      }, '🚙 Remove'),
      h('button', {
        className: 'cb g', disabled: anim || scanning,
        onClick: () => setSel(null),
      }, '✕ Clear'),
    ]),
  ]);
}

// ─── BOOT ──────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    ReactDOM.createRoot(document.getElementById('root')).render(h(App));
  });
} else {
  ReactDOM.createRoot(document.getElementById('root')).render(h(App));
}
