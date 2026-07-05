import React from 'react';
import { useState, useEffect, useRef, useCallback } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const STORAGE_KEY = "tripplanner-v2";

const CATEGORIES = [
  { id: "flight",       label: "Flight",       icon: "🛫",  color: "#0369a1" },
  { id: "transport",    label: "Transport",    icon: "🚖",  color: "#1a3a8f" },
  { id: "food",         label: "Food & Drink", icon: "🍜",  color: "#e8672a" },
  { id: "activity",     label: "Activity",     icon: "🎯",  color: "#0ea5e9" },
  { id: "accommodation",label: "Stay",         icon: "🏨",  color: "#6366f1" },
  { id: "monument",     label: "Sights",       icon: "🏛️",  color: "#f59e0b" },
  { id: "shopping",     label: "Shopping",     icon: "🛍️",  color: "#e8672a" },
  { id: "misc",         label: "Other",        icon: "📍",  color: "#a8c4e0" },
];

const CAT = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

const uid = () => `id-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function dateRange(start, end) {
  const days = [];
  const s = new Date(start), e = new Date(end);
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}
function fmtDate(iso) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short" });
}
function fmtCurrency(n, currency = "SGD") {
  if (!n) return "";
  return new Intl.NumberFormat("en-SG", { style: "currency", currency, minimumFractionDigits: 0 }).format(n);
}

// Ghost for touch drag
function mkGhost(el) {
  const r = el.getBoundingClientRect();
  const g = el.cloneNode(true);
  g.style.cssText = `position:fixed;top:${r.top}px;left:${r.left}px;width:${r.width}px;
    opacity:.85;pointer-events:none;z-index:9999;
    transform:scale(1.03) rotate(-1deg);
    box-shadow:0 20px 48px rgba(0,0,0,.35);border-radius:12px;transition:none;`;
  document.body.appendChild(g);
  return g;
}

// ─── IdeaForm modal ───────────────────────────────────────────────────────────
function IdeaForm({ idea, tripDates, travellers, onSave, onCancel }) {
  const [form, setForm] = useState(idea || {
    title: "", category: "activity", date: "", checkOut: "", time: "",
    cost: "", currency: "SGD", place: "", mapsUrl: "", notes: "",
    paidBy: "", bookedStatus: "not-booked",
    // Flight-specific
    flightNum: "", departTerminal: "", arrivalDate: "", arrivalTime: "", arrivalAirport: "",
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const isSchedulable = form.title && form.date;
  const isStay = form.category === "accommodation";
  const isFlight = form.category === "flight";

  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <span style={{ fontSize: 22 }}>{CAT[form.category]?.icon}</span>
          <span style={styles.modalTitle}>{idea ? "Edit Idea" : "New Idea"}</span>
          <button style={styles.closeBtn} onClick={onCancel}>✕</button>
        </div>

        <div style={styles.formGrid}>
          {/* Title */}
          <div style={styles.formFull}>
            <label style={styles.label}>What is it? *</label>
            <input style={styles.input} placeholder="e.g. Peking duck lunch at Sheng Yong Xing"
              value={form.title} onChange={e => set("title", e.target.value)} autoFocus
              onKeyDown={e => { if (e.key === "Enter" && form.title.trim()) onSave({ ...form, id: idea?.id || uid() }); }} />
          </div>

          {/* Category */}
          <div style={styles.formFull}>
            <label style={styles.label}>Category</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {CATEGORIES.map(c => (
                <button key={c.id} onClick={() => set("category", c.id)}
                  style={{ ...styles.catChip, background: form.category === c.id ? c.color : "#2a2a2a", color: form.category === c.id ? "#fff" : "#888" }}>
                  {c.icon} {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date + Time — flights, stays and regular items */}
          {isFlight ? (
            <>
              <div style={styles.formHalf}>
                <label style={styles.label}>Departure date</label>
                <select style={styles.input} value={form.date} onChange={e => set("date", e.target.value)}>
                  <option value="">Select date</option>
                  {(tripDates || []).map(d => <option key={d} value={d}>{fmtDate(d)}</option>)}
                </select>
              </div>
              <div style={styles.formHalf}>
                <label style={styles.label}>Departure time</label>
                <input style={styles.input} type="time" value={form.time} onChange={e => set("time", e.target.value)} />
              </div>
              <div style={styles.formHalf}>
                <label style={styles.label}>Flight number</label>
                <input style={styles.input} placeholder="e.g. SQ321" value={form.flightNum || ""} onChange={e => set("flightNum", e.target.value)} />
              </div>
              <div style={styles.formHalf}>
                <label style={styles.label}>Terminal</label>
                <input style={styles.input} placeholder="e.g. T3" value={form.departTerminal || ""} onChange={e => set("departTerminal", e.target.value)} />
              </div>
              <div style={styles.formHalf}>
                <label style={styles.label}>Arrival date</label>
                <select style={styles.input} value={form.arrivalDate || ""} onChange={e => set("arrivalDate", e.target.value)}>
                  <option value="">Select date</option>
                  {(tripDates || []).map(d => <option key={d} value={d}>{fmtDate(d)}</option>)}
                </select>
              </div>
              <div style={styles.formHalf}>
                <label style={styles.label}>Arrival time</label>
                <input style={styles.input} type="time" value={form.arrivalTime || ""} onChange={e => set("arrivalTime", e.target.value)} />
              </div>
              <div style={styles.formFull}>
                <label style={styles.label}>Arrival airport / city</label>
                <input style={styles.input} placeholder="e.g. Changi Airport T2, Singapore" value={form.arrivalAirport || ""} onChange={e => set("arrivalAirport", e.target.value)} />
              </div>
            </>
          ) : form.category === "accommodation" ? (
            <>
              <div style={styles.formHalf}>
                <label style={styles.label}>Check-in date</label>
                <select style={styles.input} value={form.date} onChange={e => set("date", e.target.value)}>
                  <option value="">No date yet</option>
                  {(tripDates || []).map(d => <option key={d} value={d}>{fmtDate(d)}</option>)}
                </select>
              </div>
              <div style={styles.formHalf}>
                <label style={styles.label}>Check-out date</label>
                <select style={styles.input} value={form.checkOut || ""} onChange={e => set("checkOut", e.target.value)}>
                  <option value="">Same as check-in</option>
                  {(tripDates || []).filter(d => !form.date || d > form.date).map(d => <option key={d} value={d}>{fmtDate(d)}</option>)}
                </select>
              </div>
            </>
          ) : (
            <>
              <div style={styles.formHalf}>
                <label style={styles.label}>Date {tripDates?.length ? `(${fmtDate(tripDates[0])} – ${fmtDate(tripDates[tripDates.length-1])})` : ""}</label>
                <select style={styles.input} value={form.date} onChange={e => set("date", e.target.value)}>
                  <option value="">No date yet</option>
                  {(tripDates || []).map(d => <option key={d} value={d}>{fmtDate(d)}</option>)}
                </select>
              </div>
              <div style={styles.formHalf}>
                <label style={styles.label}>Time</label>
                <input style={styles.input} type="time" value={form.time} onChange={e => set("time", e.target.value)} />
              </div>
            </>
          )}

          {/* Cost */}
          <div style={styles.formHalf}>
            <label style={styles.label}>Est. Cost (per person)</label>
            <input style={styles.input} type="number" placeholder="0" value={form.cost} onChange={e => set("cost", e.target.value)} />
          </div>
          <div style={styles.formHalf}>
            <label style={styles.label}>Currency</label>
            <select style={styles.input} value={form.currency} onChange={e => set("currency", e.target.value)}>
              {["SGD","USD","CNY","JPY","EUR","GBP","AUD","HKD","MYR","THB"].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          {/* Paid by */}
          <div style={styles.formHalf}>
            <label style={styles.label}>Paid by</label>
            <select style={styles.input} value={form.paidBy} onChange={e => set("paidBy", e.target.value)}>
              <option value="">—</option>
              {(travellers || []).map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div style={styles.formHalf}>
            <label style={styles.label}>Booking status</label>
            <select style={styles.input} value={form.bookedStatus} onChange={e => set("bookedStatus", e.target.value)}>
              <option value="not-booked">Not booked</option>
              <option value="need-to-book">Need to book</option>
              <option value="booked">✅ Booked</option>
            </select>
          </div>

          {/* Place + Maps */}
          <div style={styles.formFull}>
            <label style={styles.label}>Place / Address</label>
            <input style={styles.input} placeholder="e.g. 1 Michelin Star, French Concession"
              value={form.place} onChange={e => set("place", e.target.value)} />
          </div>
          <div style={styles.formFull}>
            <label style={styles.label}>Google Maps / Booking URL</label>
            <input style={styles.input} placeholder="https://maps.google.com/..."
              value={form.mapsUrl} onChange={e => set("mapsUrl", e.target.value)} />
          </div>

          {/* Notes */}
          <div style={styles.formFull}>
            <label style={styles.label}>Notes</label>
            <textarea style={{ ...styles.input, height: 64, resize: "vertical" }}
              placeholder="e.g. No reservation but can book on Dianping, last slot 8PM"
              value={form.notes} onChange={e => set("notes", e.target.value)} />
          </div>
        </div>

        <div style={styles.modalFooter}>
          {!isSchedulable && <span style={{ fontSize: 11, color: "#666" }}>Add a date to auto-schedule this idea</span>}
          <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            <button style={styles.btnSecondary} onClick={onCancel}>Cancel</button>
            <button style={styles.btnPrimary} onClick={() => onSave({ ...form, id: idea?.id || uid() })}>
              {isSchedulable ? "✅ Schedule" : "💡 Add to Pool"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── IdeaCard ─────────────────────────────────────────────────────────────────
function IdeaCard({ idea, onEdit, onDelete, onMove, draggable, onDragStart, onDragEnd, onTouchStart, onTouchMove, onTouchEnd, compact }) {
  const cat = CAT[idea.category] || CAT.misc;
  return (
    <div style={{ ...styles.ideaCard, borderLeftColor: cat.color, opacity: 1 }}
      draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>{cat.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={styles.ideaTitle}>{idea.title}</span>
            {idea.bookedStatus === "booked" && <span style={styles.bookedBadge}>✅ Booked</span>}
            {idea.bookedStatus === "need-to-book" && <span style={{ ...styles.bookedBadge, background: "#f59e0b22", color: "#f59e0b" }}>📋 Book</span>}
          </div>
          {!compact && idea.place && <div style={styles.ideaMeta}>📍 {idea.place}</div>}
          {!compact && idea.notes && <div style={{ ...styles.ideaMeta, fontStyle: "italic" }}>{idea.notes}</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
            {idea.time && <span style={styles.tag}>🕐 {idea.time}</span>}
            {idea.cost && <span style={styles.tag}>💰 {idea.cost} {idea.currency}</span>}
            {idea.paidBy && <span style={styles.tag}>👤 {idea.paidBy}</span>}
            {idea.mapsUrl && <a href={idea.mapsUrl} target="_blank" rel="noopener noreferrer" style={styles.mapsTag} onClick={e => e.stopPropagation()}>🗺 Map</a>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <button style={styles.iconBtn} onClick={() => onEdit(idea)} title="Edit">✏️</button>
          <button style={styles.iconBtn} onClick={() => onDelete(idea.id)} title="Delete">🗑</button>
        </div>
      </div>
    </div>
  );
}

// ─── TripSetup screen ─────────────────────────────────────────────────────────
function TripSetup({ onDone, savedTrip, onResume }) {
  const [name, setName] = useState("My Trip");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [traveller, setTraveller] = useState("");
  const [travellers, setTravellers] = useState([]);
  const [currency, setCurrency] = useState("SGD");

  return (
    <div style={styles.setupScreen}>
      <div style={styles.setupCard}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 48 }}>✈️</div>
          <h1 style={styles.setupTitle}>Plan a Trip</h1>
          <p style={{ color: "#666", fontSize: 14, marginTop: 6 }}>Let's start with the basics</p>
        </div>
        {savedTrip && (
          <div style={{ background: "#1a1500", border: "1px solid #f59e0b44", borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: "#f59e0b", fontWeight: 600, marginBottom: 6 }}>↩ Continue where you left off</div>
            <div style={{ fontSize: 13, color: "#ccc", marginBottom: 10 }}>{savedTrip.name} · {fmtDate(savedTrip.start)} – {fmtDate(savedTrip.end)}</div>
            <button style={{ ...styles.btnPrimary, width: "100%" }} onClick={onResume}>Resume {savedTrip.name} →</button>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={styles.label}>Trip name</label>
            <input style={styles.input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. China 2026" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={styles.label}>Start date</label>
              <input style={styles.input} type="date" value={start} onChange={e => setStart(e.target.value)} />
            </div>
            <div>
              <label style={styles.label}>End date</label>
              <input style={styles.input} type="date" value={end} onChange={e => setEnd(e.target.value)} />
            </div>
          </div>
          <div>
            <label style={styles.label}>Default currency</label>
            <select style={styles.input} value={currency} onChange={e => setCurrency(e.target.value)}>
              {["SGD","USD","CNY","JPY","EUR","GBP","AUD","HKD","MYR","THB"].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={styles.label}>Who's coming?</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ ...styles.input, flex: 1 }} placeholder="Amanda, Jihan, Clara..." value={traveller}
                onChange={e => setTraveller(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && traveller.trim()) {
                    const names = traveller.split(",").map(n => n.trim()).filter(Boolean);
                    setTravellers(t => [...t, ...names.filter(n => !t.includes(n))]);
                    setTraveller("");
                  }
                }} />
              <button style={styles.btnPrimary} onClick={() => {
                if (traveller.trim()) {
                  const names = traveller.split(",").map(n => n.trim()).filter(Boolean);
                  setTravellers(t => [...t, ...names.filter(n => !t.includes(n))]);
                  setTraveller("");
                }
              }}>Add</button>
            </div>
            <p style={{ fontSize: 10, color: "#4a6fa5", marginTop: 4, fontFamily: "'Space Mono',monospace" }}>Separate multiple names with commas</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {travellers.map(t => (
                <span key={t} style={styles.travChip}>{t}
                  <button onClick={() => setTravellers(ts => ts.filter(x => x !== t))} style={{ background: "none", border: "none", color: "#f59e0b", cursor: "pointer", marginLeft: 4 }}>✕</button>
                </span>
              ))}
            </div>
          </div>
        </div>

        <button style={{ ...styles.btnPrimary, width: "100%", marginTop: 24, padding: "14px", fontSize: 15 }}
          disabled={!name || !start || !end}
          onClick={() => onDone({ name, start, end, travellers, currency })}>
          Start Planning →
        </button>
      </div>
    </div>
  );
}

// ─── BudgetSheet ──────────────────────────────────────────────────────────────
function BudgetSheet({ ideas, travellers, currency }) {
  const costItems = ideas.filter(i => i.cost && parseFloat(i.cost) > 0);
  const total = costItems.reduce((s, i) => s + parseFloat(i.cost || 0), 0);
  const perPerson = travellers.length > 0 ? total / travellers.length : total;

  const byDay = {};
  costItems.forEach(i => {
    const key = i.date || "TBC";
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(i);
  });

  return (
    <div style={styles.budgetWrap}>
      <div style={styles.budgetSummary}>
        <div style={styles.budgetStat}>
          <div style={styles.budgetNum}>{fmtCurrency(total, currency)}</div>
          <div style={styles.budgetLabel}>Total Est. Cost</div>
        </div>
        <div style={styles.budgetStat}>
          <div style={styles.budgetNum}>{fmtCurrency(perPerson, currency)}</div>
          <div style={styles.budgetLabel}>Per Person ({travellers.length || 1} pax)</div>
        </div>
        <div style={styles.budgetStat}>
          <div style={styles.budgetNum}>{costItems.length}</div>
          <div style={styles.budgetLabel}>Line Items</div>
        </div>
      </div>

      {Object.keys(byDay).sort().map(day => (
        <div key={day} style={{ marginBottom: 20 }}>
          <div style={styles.budgetDayLabel}>{day === "TBC" ? "📋 TBC" : fmtDate(day)}</div>
          <table style={styles.budgetTable}>
            <thead>
              <tr style={{ borderBottom: "1px solid #2a2a2a" }}>
                {["Item","Category","Paid by","Status","Cost"].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byDay[day].map(item => {
                const cat = CAT[item.category] || CAT.misc;
                return (
                  <tr key={item.id} style={{ borderBottom: "1px solid #1e1e1e" }}>
                    <td style={styles.td}><span style={{ fontSize: 14 }}>{cat.icon}</span> {item.title}</td>
                    <td style={styles.td}><span style={{ color: cat.color }}>{cat.label}</span></td>
                    <td style={styles.td}>{item.paidBy || "—"}</td>
                    <td style={styles.td}>
                      <span style={{ color: item.bookedStatus === "booked" ? "#10b981" : item.bookedStatus === "need-to-book" ? "#f59e0b" : "#666" }}>
                        {item.bookedStatus === "booked" ? "✅ Booked" : item.bookedStatus === "need-to-book" ? "📋 Need to book" : "—"}
                      </span>
                    </td>
                    <td style={{ ...styles.td, textAlign: "right", color: "#f59e0b", fontWeight: 600 }}>{fmtCurrency(parseFloat(item.cost), item.currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
      {costItems.length === 0 && (
        <div style={{ textAlign: "center", color: "#444", padding: "60px 0", fontSize: 14 }}>
          Add costs to your ideas and they'll appear here automatically
        </div>
      )}
    </div>
  );
}

// ─── Export story as downloadable HTML → print to PDF ────────────────────────
function exportStoryHTML(trip, ideas) {
  const scheduled = {};
  ideas.filter(i => i.date && i.category !== "accommodation").forEach(i => {
    if (!scheduled[i.date]) scheduled[i.date] = [];
    scheduled[i.date].push(i);
  });
  Object.values(scheduled).forEach(arr => arr.sort((a,b) => (a.time||"99") > (b.time||"99") ? 1 : -1));

  const staysOnDay = {};
  ideas.filter(i => i.category === "accommodation" && i.date).forEach(stay => {
    const checkIn = stay.date;
    const checkOut = stay.checkOut || stay.date;
    trip.dates.forEach(d => {
      if (d >= checkIn && d <= checkOut) {
        if (!staysOnDay[d]) staysOnDay[d] = [];
        staysOnDay[d].push(stay);
      }
    });
  });

  const days = trip.dates.filter(d => scheduled[d] || staysOnDay[d]);
  const totalDays = trip.dates.length;

  const catMap = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

  const coverHtml = `
    <div class="cover-card">
      <div class="cover-inner">
        <div class="cover-plane">✈</div>
        <h1 class="cover-title">${trip.name}</h1>
        <div class="cover-dates">${fmtDate(trip.start)} – ${fmtDate(trip.end)}</div>
        <div class="cover-meta">${totalDays} days · ${ideas.filter(i=>i.date).length} activities</div>
        <div class="cover-travellers">${trip.travellers.map(t => `<span class="traveller">${t}</span>`).join("")}</div>
        <div class="legend">${CATEGORIES.filter(c=>c.id!=="misc").map(c=>`<span class="legend-item"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c.color};margin-right:4px;vertical-align:middle;"></span>${c.icon} ${c.label}</span>`).join("")}</div>
      </div>
    </div>`;

  const dayCards = days.map((date, idx) => {
    const stops = scheduled[date] || [];
    const stays = staysOnDay[date] || [];
    const dayNum = trip.dates.indexOf(date) + 1;

    const stayBanners = stays.map(stay => `
      <div class="stay-banner">
        <span style="font-size:16px">🏨</span>
        <div style="flex:1;min-width:0">
          <div class="stay-name">${stay.title}</div>
          ${stay.place ? `<div class="stay-place">${stay.place}</div>` : ""}
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
          ${stay.bookedStatus === "booked" ? `<span style="color:#10b981;font-size:12px">✅ Booked</span>` : ""}
          ${stay.mapsUrl ? `<a href="${stay.mapsUrl}" class="map-btn">🗺 Map</a>` : ""}
        </div>
      </div>`).join("");

    const stopItems = stops.map((item, i) => {
      const cat = catMap[item.category] || catMap.misc;
      const isLast = i === stops.length - 1;
      return `
        <div class="stop-row">
          <div class="stop-spine">
            <div class="stop-dot" style="background:${cat.color}">${i+1}</div>
            ${!isLast ? `<div class="stop-line"></div>` : ""}
          </div>
          <div class="stop-body${isLast ? "" : " stop-body-mb"}">
            <div class="stop-title">${cat.icon} ${item.title}${item.bookedStatus==="booked"?` <span style="color:#10b981">✅</span>`:item.bookedStatus==="need-to-book"?` <span style="color:#f59e0b">📋</span>`:""}</div>
            ${item.place ? `<div class="stop-place">📍 ${item.place}</div>` : ""}
            ${item.notes ? `<div class="stop-notes">${item.notes}</div>` : ""}
            <div class="stop-chips">
              ${item.time ? `<span class="chip">${item.time}</span>` : ""}
              ${item.cost ? `<span class="chip chip-cost">💰 ${item.cost} ${item.currency}</span>` : ""}
              ${item.mapsUrl ? `<a href="${item.mapsUrl}" class="map-btn">🗺 Map</a>` : ""}
            </div>
          </div>
        </div>`;
    }).join("");

    return `
      <div class="day-card">
        <div class="day-header">
          <div>
            <span class="day-num">Day ${dayNum}</span>
            <span class="day-date">${fmtDate(date)}</span>
          </div>
          <span class="day-trip">${trip.name}</span>
        </div>
        ${stayBanners}
        <div class="stops">${stopItems || `<div style="color:#888;font-size:12px;padding:12px 0;text-align:center">No activities scheduled</div>`}</div>
        <div class="day-footer">
          <span>${trip.name} · Day ${dayNum}/${totalDays}</span>
          <span>${stops.length} stop${stops.length!==1?"s":""}</span>
        </div>
      </div>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<title>${trip.name} – Itinerary</title>
<link href="https://fonts.googleapis.com/css2?family=Pacifico&family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet"/>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'DM Sans',sans-serif;background:#f0f6ff;color:#1a3a8f;padding:24px 16px;display:flex;flex-direction:column;align-items:center;gap:20px;}
.print-hint{width:min(100%,420px);background:#fef9f0;border:1px solid #f59e0b;border-radius:10px;padding:12px 16px;font-size:12px;color:#92400e;text-align:center;}
.print-hint strong{font-weight:700;}
@media print{.print-hint{display:none;} body{background:#fff;padding:0;gap:0;} .cover-card,.day-card{break-inside:avoid;page-break-after:always;box-shadow:none;border:none;border-radius:0;margin:0;width:100%;max-width:100%;}}

/* Cover */
.cover-card{width:min(100%,400px);background:linear-gradient(160deg,#1c1917 0%,#2d1f0a 60%,#1a1a2e 100%);border-radius:20px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.3);}
.cover-inner{padding:40px 28px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px;}
.cover-plane{width:64px;height:64px;background:#f59e0b;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:36px;margin-bottom:8px;}
.cover-title{font-family:'Syne',sans-serif;font-weight:800;font-size:28px;color:#fff;line-height:1.2;}
.cover-dates{font-size:14px;color:#f59e0b;}
.cover-meta{font-size:12px;color:#666;}
.cover-travellers{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:8px;}
.traveller{font-size:12px;background:rgba(245,158,11,.15);color:#f59e0b;border:1px solid rgba(245,158,11,.3);border-radius:20px;padding:4px 12px;}
.legend{display:flex;flex-wrap:wrap;gap:6px 12px;justify-content:center;margin-top:16px;padding-top:16px;border-top:1px solid #333;}
.legend-item{font-size:10px;color:#888;}

/* Day cards */
.day-card{width:min(100%,420px);background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.1);}
.day-header{padding:14px 20px 10px;background:#1c1917;display:flex;align-items:baseline;justify-content:space-between;}
.day-num{font-family:'Syne',sans-serif;font-weight:800;font-size:22px;color:#f59e0b;margin-right:10px;}
.day-date{font-size:13px;color:#888;}
.day-trip{font-size:10px;color:#444;}
.stay-banner{display:flex;align-items:center;gap:10px;background:#f3f0ff;border-bottom:1px solid #e0d9ff;padding:10px 20px;}
.stay-name{font-size:12px;color:#1a3a8f;font-weight:600;font-family:'DM Sans',sans-serif;}
.stay-place{font-size:11px;color:#a78bfa;}
.stops{padding:16px 20px;display:flex;flex-direction:column;}
.stop-row{display:flex;gap:12px;}
.stop-spine{display:flex;flex-direction:column;align-items:center;width:28px;flex-shrink:0;}
.stop-dot{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#000;flex-shrink:0;z-index:1;}
.stop-line{width:2px;flex:1;background:#e5e7eb;min-height:12px;margin-top:2px;}
.stop-body{flex:1;}
.stop-body-mb{padding-bottom:12px;}
.stop-title{font-size:13px;color:#1a3a8f;font-weight:500;line-height:1.4;font-family:'DM Sans',sans-serif;}
.stop-place{font-size:11px;color:#888;margin-top:2px;}
.stop-notes{font-size:11px;color:#aaa;margin-top:2px;font-style:italic;line-height:1.4;}
.stop-chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:5px;align-items:center;}
.chip{font-size:10px;background:#f3f4f6;color:#666;border-radius:6px;padding:2px 7px;}
.chip-cost{color:#d97706;}
.map-btn{font-size:10px;background:#fef3c7;color:#d97706;border:1px solid #fde68a;border-radius:6px;padding:2px 8px;text-decoration:none;white-space:nowrap;}
.day-footer{padding:10px 20px;border-top:1px solid #f3f4f6;display:flex;justify-content:space-between;background:#fafafa;font-size:10px;color:#aaa;}
</style></head>
<body>
<div class="print-hint">💡 <strong>To save as PDF:</strong> Press Cmd+P (Mac) or Ctrl+P (Windows) → Destination: <strong>Save as PDF</strong> → Save. Links stay clickable!</div>
${coverHtml}
${dayCards}
</body></html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${trip.name.replace(/[^a-z0-9]/gi,"_")}_itinerary.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}


// ─── MapView — VOLO-style winding journey map, one card per day ───────────────
function MapView({ trip, ideas }) {
  const scheduled = {};
  ideas.filter(i => i.date && i.category !== "accommodation").forEach(i => {
    if (!scheduled[i.date]) scheduled[i.date] = [];
    scheduled[i.date].push(i);
  });
  Object.values(scheduled).forEach(arr => arr.sort((a,b) => (a.time||"99") > (b.time||"99") ? 1 : -1));

  const staysOnDay = {};
  ideas.filter(i => i.category === "accommodation" && i.date).forEach(stay => {
    const checkIn = stay.date;
    const checkOut = stay.checkOut || stay.date;
    trip.dates.forEach(d => {
      if (d >= checkIn && d <= checkOut) {
        if (!staysOnDay[d]) staysOnDay[d] = [];
        staysOnDay[d].push(stay);
      }
    });
  });

  const days = trip.dates.filter(d => scheduled[d] || staysOnDay[d]);
  const totalDays = trip.dates.length;

  if (days.length === 0) {
    return (
      <div style={styles.storyOuter}>
        <div style={{ color: "#4a6fa5", textAlign: "center", padding: "80px 0", fontSize: 14, fontFamily: "'DM Sans',sans-serif" }}>
          Schedule some ideas to see your journey map
        </div>
      </div>
    );
  }

  // Terrain textures per day index (cycles)
  const terrains = [
    { bg: "linear-gradient(180deg,#deeaf7 0%,#c8e6f0 60%,#a8d4e8 100%)", road: "#fff", label: "coastal" },
    { bg: "linear-gradient(180deg,#e8f5e9 0%,#c8e6c9 60%,#a5d6a7 100%)", road: "#fff", label: "forest" },
    { bg: "linear-gradient(180deg,#fff8e1 0%,#ffecb3 60%,#ffe082 100%)", road: "#fff", label: "desert" },
    { bg: "linear-gradient(180deg,#fce4ec 0%,#f8bbd0 60%,#f48fb1 100%)", road: "#fff", label: "city" },
    { bg: "linear-gradient(180deg,#ede7f6 0%,#d1c4e9 60%,#b39ddb 100%)", road: "#fff", label: "mountain" },
  ];

  return (
    <div style={styles.storyOuter}>
      {/* Cover map card */}
      <div style={{ ...styles.mapCard, background: "linear-gradient(160deg,#1a3a8f 0%,#2a5298 50%,#a8c4e0 100%)" }}>
        <div style={styles.mapCoverInner}>
          <div style={{ fontSize: 52, marginBottom: 8 }}>🗺️</div>
          <div style={styles.mapCoverTitle}>{trip.name}</div>
          <div style={styles.mapCoverDates}>{fmtDate(trip.start)} — {fmtDate(trip.end)}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", marginTop: 12 }}>
            {trip.travellers.map(t => <span key={t} style={styles.storyCoverTraveller}>{t}</span>)}
          </div>
          <div style={styles.mapCoverStats}>
            <span style={styles.mapStat}><span style={styles.mapStatNum}>{totalDays}</span><br/>days</span>
            <span style={styles.mapStatDivider}>·</span>
            <span style={styles.mapStat}><span style={styles.mapStatNum}>{ideas.filter(i=>i.date).length}</span><br/>stops</span>
            <span style={styles.mapStatDivider}>·</span>
            <span style={styles.mapStat}><span style={styles.mapStatNum}>{trip.travellers.length||1}</span><br/>travellers</span>
          </div>
          {/* Dotted flight path decoration */}
          <svg width="260" height="40" style={{ marginTop: 16, opacity: 0.4 }}>
            <path d="M 10 20 Q 65 5 130 20 Q 195 35 250 20" stroke="#f5e882" strokeWidth="2" strokeDasharray="5,5" fill="none"/>
            <text x="10" y="24" fontSize="16">🛫</text>
            <text x="230" y="24" fontSize="16">🛬</text>
          </svg>
        </div>
      </div>

      {/* One winding map card per day */}
      {days.map((date, dayIdx) => {
        const stops = scheduled[date] || [];
        const stays = staysOnDay[date] || [];
        const allStops = [...stays.map(s => ({ ...s, _isStay: true })), ...stops];
        const dayNum = trip.dates.indexOf(date) + 1;
        const terrain = terrains[dayIdx % terrains.length];

        // SVG winding path: alternating left-right columns
        const CARD_W = 340;
        const STOP_H = 100;
        const SVG_H = Math.max(200, allStops.length * STOP_H + 60);
        const LEFT_X = 80, RIGHT_X = 260, MID_X = 170;

        const stopPositions = allStops.map((_, i) => ({
          x: i % 2 === 0 ? LEFT_X : RIGHT_X,
          y: 50 + i * STOP_H,
        }));

        // Build SVG path segments
        let pathD = "";
        if (stopPositions.length > 0) {
          pathD = `M ${stopPositions[0].x} ${stopPositions[0].y}`;
          for (let i = 1; i < stopPositions.length; i++) {
            const prev = stopPositions[i-1];
            const cur = stopPositions[i];
            // S-curve between stops
            pathD += ` C ${prev.x} ${prev.y + STOP_H*0.5}, ${cur.x} ${cur.y - STOP_H*0.5}, ${cur.x} ${cur.y}`;
          }
        }

        return (
          <div key={date} style={{ ...styles.mapCard, background: terrain.bg }}>
            {/* Day header */}
            <div style={styles.mapDayHeader}>
              <span style={styles.mapDayNum}>Day {dayNum}</span>
              <span style={styles.mapDayDate}>{fmtDate(date)}</span>
              <span style={styles.mapDayTrip}>{trip.name}</span>
            </div>

            {/* The map itself */}
            <div style={{ position: "relative", width: "100%", minHeight: SVG_H }}>
              <svg width="100%" height={SVG_H} viewBox={`0 0 ${CARD_W} ${SVG_H}`} style={{ position: "absolute", top: 0, left: 0 }}>
                {/* Ground texture dots */}
                {Array.from({length: 30}).map((_,i) => (
                  <circle key={i} cx={20 + (i*67%290)} cy={30 + (i*53%SVG_H)} r="2" fill="rgba(255,255,255,0.25)"/>
                ))}
                {/* Road shadow */}
                {pathD && <path d={pathD} stroke="rgba(0,0,0,0.08)" strokeWidth="14" fill="none" strokeLinecap="round"/>}
                {/* Road */}
                {pathD && <path d={pathD} stroke={terrain.road} strokeWidth="10" fill="none" strokeLinecap="round" strokeOpacity="0.9"/>}
                {/* Dashes on road */}
                {pathD && <path d={pathD} stroke="#e8e8e8" strokeWidth="2" strokeDasharray="8,12" fill="none" strokeLinecap="round" strokeOpacity="0.6"/>}
              </svg>

              {/* Stop nodes */}
              {allStops.map((item, i) => {
                const cat = item._isStay ? CAT["accommodation"] : (CAT[item.category] || CAT.misc);
                const pos = stopPositions[i];
                const isLeft = i % 2 === 0;
                if (!pos) return null;

                const xPct = (pos.x / CARD_W) * 100;
                const yPct = (pos.y / SVG_H) * 100;

                return (
                  <div key={item.id} style={{
                    position: "absolute",
                    left: `${xPct}%`,
                    top: `${yPct}%`,
                    transform: "translate(-50%, -50%)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    zIndex: 10,
                    width: 120,
                  }}>
                    {/* Illustration placeholder bubble */}
                    <div style={{
                      width: 52, height: 52,
                      borderRadius: "50%",
                      background: "#fff",
                      border: `3px solid ${cat.color}`,
                      boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 24,
                      marginBottom: 4,
                      position: "relative",
                    }}>
                      {cat.icon}
                      {/* Stop number badge */}
                      <div style={{
                        position: "absolute", top: -4, right: -4,
                        width: 18, height: 18, borderRadius: "50%",
                        background: cat.color, color: "#fff",
                        fontSize: 9, fontWeight: 700,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontFamily: "'Space Mono',monospace",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                      }}>{i + 1}</div>
                    </div>
                    {/* Label pill */}
                    <div style={{
                      background: "rgba(255,255,255,0.92)",
                      borderRadius: 20,
                      padding: "2px 8px",
                      fontSize: 9,
                      color: "#1a3a8f",
                      fontFamily: "'DM Sans',sans-serif",
                      fontWeight: 600,
                      textAlign: "center",
                      maxWidth: 110,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
                      lineHeight: 1.6,
                    }}>
                      {item._isStay ? "🏨 " : ""}{item.title}
                    </div>
                    {/* Time if present */}
                    {item.time && !item._isStay && (
                      <div style={{
                        fontSize: 8, color: "#4a6fa5",
                        fontFamily: "'Space Mono',monospace",
                        marginTop: 2,
                      }}>{item.time}</div>
                    )}
                    {/* Map link */}
                    {item.mapsUrl && (
                      <a href={item.mapsUrl} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 8, color: "#e8672a", marginTop: 1, textDecoration: "none", fontFamily: "'Space Mono',monospace" }}
                        onClick={e => e.stopPropagation()}>
                        🗺 map
                      </a>
                    )}
                  </div>
                );
              })}

              {/* Empty state */}
              {allStops.length === 0 && (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "#4a6fa5", fontSize: 12, fontFamily: "'DM Sans',sans-serif" }}>
                  No stops yet for this day
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={styles.mapDayFooter}>
              <span>{allStops.length} stop{allStops.length !== 1 ? "s" : ""}</span>
              {allStops.some(s => s.mapsUrl) && (
                <a href={`https://www.google.com/maps/dir/${stops.filter(s=>s.title).map(s=>encodeURIComponent(s.title)).join("/")}`}
                  target="_blank" rel="noopener noreferrer" style={styles.storyMapBtn}>
                  🗺 Full day route
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── StoryView — one 9:16 card per day, vertically stacked ──────────────────
function StoryView({ trip, ideas }) {
  const scheduled = {};
  ideas.filter(i => i.date && i.category !== "accommodation").forEach(i => {
    if (!scheduled[i.date]) scheduled[i.date] = [];
    scheduled[i.date].push(i);
  });
  Object.values(scheduled).forEach(arr => arr.sort((a,b) => (a.time||"99") > (b.time||"99") ? 1 : -1));

  const staysOnDay = {};
  ideas.filter(i => i.category === "accommodation" && i.date).forEach(stay => {
    const checkIn = stay.date;
    const checkOut = stay.checkOut || stay.date;
    trip.dates.forEach(d => {
      if (d >= checkIn && d <= checkOut) {
        if (!staysOnDay[d]) staysOnDay[d] = [];
        staysOnDay[d].push(stay);
      }
    });
  });

  const days = trip.dates.filter(d => scheduled[d] || staysOnDay[d]);
  const totalDays = trip.dates.length;

  if (days.length === 0) {
    return (
      <div style={styles.storyOuter}>
        <div style={{ color: "#444", textAlign: "center", padding: "80px 0", fontSize: 14 }}>
          Schedule some ideas to see your story cards
        </div>
      </div>
    );
  }

  return (
    <div style={styles.storyOuter}>
      <p style={{ color: "#555", fontSize: 12, marginBottom: 16, textAlign: "center" }}>
        {days.length} day card{days.length > 1 ? "s" : ""} · screenshot each to share · tap links to open
      </p>

      {/* Cover card */}
      <div style={styles.storyCoverCard}>
        <div style={styles.storyCoverInner}>
          <div style={styles.storyCoverEmoji}>✈</div>
          <div style={styles.storyCoverTitle}>{trip.name}</div>
          <div style={styles.storyCoverDates}>{fmtDate(trip.start)} – {fmtDate(trip.end)}</div>
          <div style={styles.storyCoverMeta}>{totalDays} days · {ideas.filter(i=>i.date).length} activities</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 16 }}>
            {trip.travellers.map(t => (
              <span key={t} style={styles.storyCoverTraveller}>{t}</span>
            ))}
          </div>
          {/* Category legend */}
          <div style={styles.storyCoverLegend}>
            {CATEGORIES.filter(c => c.id !== "misc").map(c => (
              <div key={c.id} style={styles.storyCoverLegendItem}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
                <span style={{ fontSize: 9, color: "#888" }}>{c.icon} {c.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* One card per day */}
      {days.map((date, dayIdx) => {
        const stops = scheduled[date] || [];
        const stays = staysOnDay[date] || [];
        const dayNum = trip.dates.indexOf(date) + 1;

        return (
          <div key={date} style={styles.storyDayCard}>
            {/* Card header */}
            <div style={styles.storyDayCardHeader}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span style={styles.storyDayNum}>Day {dayNum}</span>
                <span style={styles.storyDayCardDate}>{fmtDate(date)}</span>
              </div>
              <span style={styles.storyDayCardTrip}>{trip.name}</span>
            </div>

            {/* Stay banner if any */}
            {stays.map(stay => (
              <div key={stay.id} style={styles.storyDayStayBanner}>
                <span style={{ fontSize: 14 }}>🏨</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "#1a3a8f", fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>{stay.title}</div>
                  {stay.place && <div style={{ fontSize: 10, color: "#7c6fbb" }}>{stay.place}</div>}
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                  {stay.bookedStatus === "booked" && <span style={{ fontSize: 10, color: "#10b981" }}>✅</span>}
                  {stay.mapsUrl && <a href={stay.mapsUrl} target="_blank" rel="noopener noreferrer" style={styles.storyMapBtn}>🗺</a>}
                </div>
              </div>
            ))}

            {/* Stops timeline */}
            <div style={styles.storyDayStops}>
              {stops.length === 0 && (
                <div style={{ color: "#333", fontSize: 12, padding: "12px 0", textAlign: "center" }}>No activities scheduled</div>
              )}
              {stops.map((item, i) => {
                const cat = CAT[item.category] || CAT.misc;
                const isLast = i === stops.length - 1;
                return (
                  <div key={item.id} style={{ display: "flex", gap: 12, position: "relative" }}>
                    {/* Timeline spine */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 28, flexShrink: 0 }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: cat.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#000", flexShrink: 0, zIndex: 1 }}>
                        {i + 1}
                      </div>
                      {!isLast && <div style={{ width: 2, flex: 1, background: "#1e1e1e", minHeight: 12, marginTop: 2 }} />}
                    </div>
                    {/* Stop content */}
                    <div style={{ flex: 1, paddingBottom: isLast ? 0 : 12 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, color: "#1a3a8f", fontWeight: 500, lineHeight: 1.3, fontFamily: "'DM Sans',sans-serif" }}>
                            {cat.icon} {item.title}
                            {item.bookedStatus === "booked" && <span style={{ color: "#10b981", marginLeft: 6 }}>✅</span>}
                            {item.bookedStatus === "need-to-book" && <span style={{ color: "#f59e0b", marginLeft: 6, fontSize: 11 }}>📋</span>}
                          </div>
                          {item.place && <div style={{ fontSize: 11, color: "#4a6fa5", marginTop: 2, fontFamily: "'DM Sans',sans-serif" }}>📍 {item.place}</div>}
                          {item.notes && <div style={{ fontSize: 11, color: "#4a6fa5", marginTop: 2, fontStyle: "italic", lineHeight: 1.4, fontFamily: "'DM Sans',sans-serif" }}>{item.notes}</div>}
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                            {item.time && <span style={styles.storyChip}>{item.time}</span>}
                            {item.cost && <span style={{ ...styles.storyChip, color: "#f59e0b" }}>💰 {item.cost} {item.currency}</span>}
                          </div>
                        </div>
                        {item.mapsUrl && (
                          <a href={item.mapsUrl} target="_blank" rel="noopener noreferrer" style={styles.storyMapBtn}>🗺</a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Card footer */}
            <div style={styles.storyDayCardFooter}>
              <span style={{ color: "#333", fontSize: 10 }}>{trip.name} · Day {dayNum}/{totalDays}</span>
              <span style={{ color: "#333", fontSize: 10 }}>{stops.length} stop{stops.length !== 1 ? "s" : ""}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function TripPlanner() {
  const [trip, setTrip] = useState(null);
  const [ideas, setIdeas] = useState([]);
  const [tab, setTab] = useState("plan");
  const [showForm, setShowForm] = useState(false);
  const [editIdea, setEditIdea] = useState(null);
  const [activeDay, setActiveDay] = useState(null);
  const [mobileView, setMobileView] = useState("pool"); // "pool" | "schedule"
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [saveStatus, setSaveStatus] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [storyMode, setStoryMode] = useState("cards"); // "cards" | "map"
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTraveller, setSettingsTraveller] = useState("");
  const [savedSnapshot, setSavedSnapshot] = useState(null); // last known saved state
  const ghostRef = useRef(null);
  const touchRef = useRef(null);
  const stateRef = useRef({ ideas, trip });
  stateRef.current = { ideas, trip };

  // Storage
  useEffect(() => {
    async function load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const s = JSON.parse(raw);
          if (s.trip) { setTrip(s.trip); setActiveDay(s.trip.dates?.[0] || null); setSavedSnapshot(s); }
          if (s.ideas) setIdeas(s.ideas);
        }
      } catch {}
      setLoaded(true);
    }
    load();
  }, []);

  // Always keep a ref with latest state (for beforeunload)
  const stateForSave = useRef({ trip, ideas });
  stateForSave.current = { trip, ideas };

  // Auto-save 3 seconds after any change
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(async () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ trip, ideas }));
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus(""), 2500);
      } catch { setSaveStatus("error"); }
    }, 3000);
    return () => clearTimeout(t);
  }, [trip, ideas, loaded]);

  // Emergency save when tab/window closes
  useEffect(() => {
    const handleUnload = () => {
      const data = JSON.stringify(stateForSave.current);
      // Use sendBeacon for reliability on close — falls back to sync localStorage as a lifeboat
      try { localStorage.setItem(STORAGE_KEY, data); } catch {}
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);

  const manualSave = async () => {
    setSaveStatus("saving");
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ trip, ideas }));
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus(""), 2500);
    } catch { setSaveStatus("error"); }
  };

  // Derived
  const tripDates = trip?.dates || [];

  // Stays that span multiple days — compute which days each stay covers
  const staysOnDay = {}; // date -> stay ideas that are active that day
  ideas.filter(i => i.category === "accommodation" && i.date).forEach(stay => {
    const checkIn = stay.date;
    const checkOut = stay.checkOut || stay.date;
    tripDates.forEach(d => {
      if (d >= checkIn && d <= checkOut) {
        if (!staysOnDay[d]) staysOnDay[d] = [];
        staysOnDay[d].push(stay);
      }
    });
  });

  // Scheduled: non-stay items with a date, sorted by time
  const scheduled = {};
  ideas.filter(i => i.date && i.category !== "accommodation").forEach(i => {
    if (!scheduled[i.date]) scheduled[i.date] = [];
    scheduled[i.date].push(i);
  });
  Object.values(scheduled).forEach(arr => arr.sort((a,b) => (a.time||"99:99") > (b.time||"99:99") ? 1 : -1));

  const poolIdeas = ideas.filter(i => !i.date);

  // Save idea (add or update), auto-schedule if date present
  const saveIdea = useCallback((idea) => {
    setIdeas(prev => {
      const exists = prev.find(i => i.id === idea.id);
      return exists ? prev.map(i => i.id === idea.id ? idea : i) : [idea, ...prev];
    });
    setShowForm(false);
    setEditIdea(null);
    if (idea.date) setActiveDay(idea.date);
  }, []);

  const deleteIdea = useCallback((id) => setIdeas(prev => prev.filter(i => i.id !== id)), []);

  // Drag & drop (desktop)
  const startDrag = (e, idea) => { setDragging(idea); e.dataTransfer.effectAllowed = "move"; };
  const onDropDay = (e, date) => {
    e.preventDefault();
    if (!dragging) return;
    setIdeas(prev => prev.map(i => i.id === dragging.id ? { ...i, date } : i));
    setDragging(null); setDragOver(null); setActiveDay(date);
  };
  const onDropPool = (e) => {
    e.preventDefault();
    if (!dragging) return;
    setIdeas(prev => prev.map(i => i.id === dragging.id ? { ...i, date: "", time: "" } : i));
    setDragging(null); setDragOver(null);
  };

  // Touch drag
  const onTouchStart = (e, idea) => {
    const touch = e.touches[0];
    touchRef.current = { idea, startX: touch.clientX, startY: touch.clientY, moved: false, el: e.currentTarget };
  };
  const onTouchMove = (e) => {
    const ref = touchRef.current;
    if (!ref) return;
    const touch = e.touches[0];
    if (!ref.moved && Math.abs(touch.clientX - ref.startX) < 8 && Math.abs(touch.clientY - ref.startY) < 8) return;
    e.preventDefault();
    if (!ref.moved) { ghostRef.current = mkGhost(ref.el); ref.moved = true; setDragging(ref.idea); }
    if (ghostRef.current) {
      ghostRef.current.style.top = `${touch.clientY - ghostRef.current.offsetHeight / 2}px`;
      ghostRef.current.style.left = `${touch.clientX - ghostRef.current.offsetWidth / 2}px`;
    }
    const zone = document.elementFromPoint(touch.clientX, touch.clientY)?.closest("[data-dropzone]");
    setDragOver(zone?.getAttribute("data-dropzone") || null);
  };
  const onTouchEnd = () => {
    const ref = touchRef.current;
    if (ghostRef.current) { ghostRef.current.remove(); ghostRef.current = null; }
    if (ref?.moved && dragging && dragOver) {
      if (dragOver === "pool") setIdeas(prev => prev.map(i => i.id === dragging.id ? { ...i, date: "", time: "" } : i));
      else setIdeas(prev => prev.map(i => i.id === dragging.id ? { ...i, date: dragOver } : i));
    }
    setDragging(null); setDragOver(null); touchRef.current = null;
  };

  const dragProps = (idea) => ({
    draggable: true,
    onDragStart: e => startDrag(e, idea),
    onDragEnd: () => { setDragging(null); setDragOver(null); },
    onTouchStart: e => onTouchStart(e, idea),
    onTouchMove,
    onTouchEnd,
  });

  if (!loaded) return <div style={{ background: "#0e0e0e", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}>Loading…</div>;
  if (!trip) return <TripSetup
    onDone={(t) => { const dates = dateRange(t.start, t.end); const tripObj = { ...t, dates }; setTrip(tripObj); setActiveDay(dates[0]); }}
    savedTrip={savedSnapshot?.trip || null}
    onResume={() => {
      if (savedSnapshot?.trip) { setTrip(savedSnapshot.trip); setIdeas(savedSnapshot.ideas || []); setActiveDay(savedSnapshot.trip.dates?.[0] || null); }
    }}
  />;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Pacifico&family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        html,body{height:100%;overflow:hidden;background:#deeaf7;font-family:'DM Sans',sans-serif;color:#1a3a8f;-webkit-font-smoothing:antialiased;}
        ::-webkit-scrollbar{width:3px;height:3px;} ::-webkit-scrollbar-track{background:transparent;} ::-webkit-scrollbar-thumb{background:#a8c4e0;border-radius:4px;}
        input,select,textarea{color-scheme:light;font-family:'DM Sans',sans-serif;}
        a{color:inherit;}
        button{-webkit-tap-highlight-color:transparent;}
        /* Mobile: sidebar/panel toggle */
        .sidebar{display:none!important;}
        .sidebar.show{display:flex!important;}
        .main-panel{display:none!important;}
        .main-panel.show{display:flex!important;}
        .mobile-nav{display:flex!important;}
        /* Desktop: show both side by side */
        @media(min-width:768px){
          .sidebar{display:flex!important;}
          .main-panel{display:flex!important;}
          .mobile-nav{display:none!important;}
        }
      `}</style>

      {/* Forms */}
      {(showForm || editIdea) && (
        <IdeaForm idea={editIdea} tripDates={tripDates} travellers={trip.travellers}
          onSave={saveIdea}
          onCancel={() => { setShowForm(false); setEditIdea(null); }} />
      )}

      {/* Confirm new trip modal */}
      {confirmNew && (
        <div style={styles.overlay} onClick={() => setConfirmNew(false)}>
          <div style={{ ...styles.modal, maxWidth: 360 }} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <span style={{ fontSize: 22 }}>⚠️</span>
              <span style={styles.modalTitle}>Start a new trip?</span>
              <button style={styles.closeBtn} onClick={() => setConfirmNew(false)}>✕</button>
            </div>
            <div style={{ padding: "16px 20px", color: "#888", fontSize: 13, lineHeight: 1.6 }}>
              Your current trip <strong style={{ color: "#fff" }}>{trip?.name}</strong> and all its ideas will be archived. You can resume it next time you open the app.
            </div>
            <div style={{ ...styles.modalFooter, justifyContent: "flex-end" }}>
              <button style={styles.btnSecondary} onClick={() => setConfirmNew(false)}>Cancel</button>
              <button style={{ ...styles.btnPrimary, background: "#ef4444" }} onClick={() => {
                setSavedSnapshot({ trip, ideas });
                setTrip(null);
                setIdeas([]);
                setConfirmNew(false);
              }}>Yes, start fresh</button>
            </div>
          </div>
        </div>
      )}

      {/* Trip settings modal — add/remove travellers anytime */}
      {showSettings && trip && (
        <div style={styles.overlay} onClick={() => setShowSettings(false)}>
          <div style={{ ...styles.modal, maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <span style={{ fontSize: 20 }}>⚙️</span>
              <span style={styles.modalTitle}>Trip Settings</span>
              <button style={styles.closeBtn} onClick={() => setShowSettings(false)}>✕</button>
            </div>
            <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={styles.label}>Trip name</label>
                <input style={styles.input} value={trip.name}
                  onChange={e => setTrip(t => ({ ...t, name: e.target.value }))} />
              </div>
              <div>
                <label style={styles.label}>Who's coming?</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input style={{ ...styles.input, flex: 1 }} placeholder="Add names, separate with commas"
                    value={settingsTraveller}
                    onChange={e => setSettingsTraveller(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && settingsTraveller.trim()) {
                        const names = settingsTraveller.split(",").map(n => n.trim()).filter(Boolean);
                        setTrip(t => ({ ...t, travellers: [...t.travellers, ...names.filter(n => !t.travellers.includes(n))] }));
                        setSettingsTraveller("");
                      }
                    }} />
                  <button style={styles.btnPrimary} onClick={() => {
                    if (settingsTraveller.trim()) {
                      const names = settingsTraveller.split(",").map(n => n.trim()).filter(Boolean);
                      setTrip(t => ({ ...t, travellers: [...t.travellers, ...names.filter(n => !t.travellers.includes(n))] }));
                      setSettingsTraveller("");
                    }
                  }}>Add</button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {(trip.travellers || []).map(t => (
                    <span key={t} style={styles.travChip}>{t}
                      <button onClick={() => setTrip(tr => ({ ...tr, travellers: tr.travellers.filter(x => x !== t) }))}
                        style={{ background: "none", border: "none", color: "#e8672a", cursor: "pointer", marginLeft: 4 }}>✕</button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ ...styles.modalFooter, justifyContent: "flex-end" }}>
              <button style={styles.btnPrimary} onClick={() => setShowSettings(false)}>Done</button>
            </div>
          </div>
        </div>
      )}

      <div style={styles.app}>
        {/* Top bar */}
        <div style={styles.topbar}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
            <span style={styles.logo}>✈</span>
            <div style={{ minWidth: 0 }}>
              <div style={styles.tripName}>{trip.name}</div>
              <div style={styles.tripMeta}>{fmtDate(trip.start)} – {fmtDate(trip.end)}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <button style={styles.iconAction} onClick={() => setShowForm(true)} title="Add idea">
              <span style={{ fontSize: 18 }}>＋</span>
            </button>
            <button
              style={{ ...styles.iconAction, ...(saveStatus === "saved" ? { color: "#10b981" } : saveStatus === "error" ? { color: "#ef4444" } : {}) }}
              onClick={manualSave} title="Save">
              <span style={{ fontSize: 16 }}>{saveStatus === "saving" ? "⏳" : saveStatus === "saved" ? "✓" : "💾"}</span>
            </button>
            <button style={styles.iconAction} onClick={() => setShowSettings(true)} title="Settings">
              <span style={{ fontSize: 16 }}>⚙️</span>
            </button>
          </div>
        </div>
        {/* Tab bar — full width below topbar */}
        <div style={styles.tabRowBar}>
          {[["plan","📋","Plan"],["budget","💰","Budget"],["story","📱","Share"]].map(([id,icon,label]) => (
            <button key={id} style={{ ...styles.tabRowBtn, ...(tab === id ? styles.tabRowBtnActive : {}) }}
              onClick={() => { setTab(id); if(id==="plan") setMobileView("pool"); }}>
              <span>{icon}</span><span>{label}</span>
            </button>
          ))}
          <button style={{ ...styles.tabRowBtn, fontSize: 11, color: "#a8c4e0" }} onClick={() => setConfirmNew(true)}>＋ New</button>
        </div>

        {/* Main content area */}
        {tab === "plan" && (
          <div style={styles.planLayout}>
            {/* Ideas Pool */}
            <div className={`sidebar${mobileView === "pool" ? " show" : ""}`} style={{ ...styles.poolPanel, ...(dragOver === "pool" ? { borderColor: "#f59e0b", background: "#1a1500" } : {}) }}
              data-dropzone="pool"
              onDragOver={e => { e.preventDefault(); setDragOver("pool"); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={onDropPool}>
              <div style={styles.panelHead}>
                <span style={styles.panelTitle}>💡 Ideas Pool</span>
                <span style={styles.countBadge}>{poolIdeas.length}</span>
              </div>
              <p style={styles.panelHint}>Ideas without a date live here. Drag to a day or add a date to schedule.</p>
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, paddingRight: 2 }}>
                {poolIdeas.map(idea => (
                  <IdeaCard key={idea.id} idea={idea}
                    onEdit={i => setEditIdea(i)}
                    onDelete={deleteIdea}
                    {...dragProps(idea)} />
                ))}
                {poolIdeas.length === 0 && <div style={styles.emptyState}>All ideas scheduled! 🎉</div>}
              </div>
              <button style={{ ...styles.btnPrimary, width: "100%", marginTop: 12 }} onClick={() => setShowForm(true)}>+ Add Idea</button>
            </div>

            {/* Day Schedule */}
            <div className={`main-panel${mobileView === "schedule" ? " show" : ""}`} style={styles.schedulePanel}>
              {/* Day tabs */}
              <div style={styles.dayTabs}>
                {tripDates.map(d => (
                  <button key={d} style={{ ...styles.dayTab, ...(activeDay === d ? styles.dayTabActive : {}) }} onClick={() => setActiveDay(d)}>
                    <span>{fmtDate(d)}</span>
                    {(scheduled[d]?.length > 0 || staysOnDay[d]?.length > 0) && <span style={styles.dayCount}>{(scheduled[d]?.length || 0) + (staysOnDay[d]?.length || 0)}</span>}
                  </button>
                ))}
              </div>

              {/* Day content */}
              <div style={{ ...styles.dayContent, ...(dragOver === activeDay ? { background: "#0f1a0f", outline: "2px dashed #10b981" } : {}) }}
                data-dropzone={activeDay}
                onDragOver={e => { e.preventDefault(); setDragOver(activeDay); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={e => onDropDay(e, activeDay)}>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexShrink: 0 }}>
                  <div style={styles.dayTitle}>{activeDay ? fmtDate(activeDay) : "—"}</div>
                  {activeDay && scheduled[activeDay]?.length > 0 && (
                    <a href={`https://www.google.com/maps/dir/${scheduled[activeDay].filter(i=>i.mapsUrl).map(i=>encodeURIComponent(i.title)).join("/")}`}
                      target="_blank" rel="noopener noreferrer" style={styles.mapsBtn}>🗺 Day Route</a>
                  )}
                </div>

                <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 0 }}>
                  {/* Stay banners */}
                  {activeDay && (staysOnDay[activeDay] || []).map(stay => (
                    <div key={stay.id} style={styles.stayBanner}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 20 }}>🏨</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "#1a3a8f", fontFamily: "'DM Sans',sans-serif" }}>{stay.title}</div>
                          <div style={{ fontSize: 11, color: "#4a6fa5", marginTop: 2, fontFamily: "'DM Sans',sans-serif" }}>
                            {fmtDate(stay.date)}{stay.checkOut && stay.checkOut !== stay.date ? ` → ${fmtDate(stay.checkOut)}` : ""}
                            {stay.place ? ` · ${stay.place}` : ""}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          {stay.bookedStatus === "booked" && <span style={styles.bookedBadge}>✅</span>}
                          {stay.mapsUrl && <a href={stay.mapsUrl} target="_blank" rel="noopener noreferrer" style={styles.mapsTag}>🗺</a>}
                          <button style={styles.iconBtn} onClick={() => setEditIdea(stay)}>✏️</button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {activeDay && (scheduled[activeDay] || []).map((idea, idx) => (
                    <div key={idea.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <div style={styles.tlLine}>
                        <div style={{ ...styles.tlDot, background: CAT[idea.category]?.color || "#555" }} />
                        {idx < (scheduled[activeDay].length - 1) && <div style={styles.tlConnector} />}
                      </div>
                      <div style={{ flex: 1, marginBottom: 8 }}>
                        <IdeaCard idea={idea} compact
                          onEdit={i => setEditIdea(i)}
                          onDelete={deleteIdea}
                          {...dragProps(idea)} />
                      </div>
                    </div>
                  ))}
                  {(!activeDay || (!scheduled[activeDay]?.length && !staysOnDay[activeDay]?.length)) && (
                    <div style={styles.dropHint}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>🗓</div>
                      <div>Drop ideas here or give an idea this date</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "budget" && <BudgetSheet ideas={ideas} travellers={trip.travellers} currency={trip.currency} />}
        {tab === "story" && (
          <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
            <div style={{ padding: "10px 16px", borderBottom: "1px solid #a8c4e0", background: "#c8dff5", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, gap: 10, flexWrap: "wrap" }}>
              {/* View toggle */}
              <div style={{ display: "flex", background: "#a8c4e0", borderRadius: 8, padding: 3, gap: 2 }}>
                <button onClick={() => setStoryMode("cards")}
                  style={{ padding: "5px 12px", borderRadius: 6, border: "none", fontFamily: "'Space Mono',monospace", fontSize: 11, cursor: "pointer", background: storyMode === "cards" ? "#fff" : "transparent", color: storyMode === "cards" ? "#1a3a8f" : "#4a6fa5", fontWeight: storyMode === "cards" ? 700 : 400, transition: "all .2s" }}>
                  📋 Cards
                </button>
                <button onClick={() => setStoryMode("map")}
                  style={{ padding: "5px 12px", borderRadius: 6, border: "none", fontFamily: "'Space Mono',monospace", fontSize: 11, cursor: "pointer", background: storyMode === "map" ? "#fff" : "transparent", color: storyMode === "map" ? "#1a3a8f" : "#4a6fa5", fontWeight: storyMode === "map" ? 700 : 400, transition: "all .2s" }}>
                  🗺 Journey Map
                </button>
              </div>
              <button
                style={{ ...styles.btnPrimary, display: "flex", alignItems: "center", gap: 6 }}
                onClick={() => exportStoryHTML(trip, ideas)}
              >
                ⬇ Export PDF
              </button>
            </div>
            {storyMode === "cards" ? <StoryView trip={trip} ideas={ideas} /> : <MapView trip={trip} ideas={ideas} />}
          </div>
        )}

        {/* Mobile bottom nav */}
        <div className="mobile-nav" style={styles.mobileNav}>
          {[["pool","💡","Ideas"],["schedule","🗓","Plan"]].map(([id,icon,label]) => (
            <button key={id} style={{ ...styles.mnavBtn, ...(tab==="plan" && mobileView === id ? styles.mnavActive : {}) }}
              onClick={() => { setTab("plan"); setMobileView(id); }}>
              <span style={{ fontSize: 22 }}>{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  app: { height: "100dvh", display: "flex", flexDirection: "column", background: "#deeaf7", overflow: "hidden" },
  topbar: { background: "#1a3a8f", padding: "10px 16px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 },
  tabRowBar: { background: "#0f2470", display: "flex", borderBottom: "1px solid #1230a0", flexShrink: 0 },
  tabRowBtn: { flex: 1, padding: "10px 4px", border: "none", background: "none", color: "#a8c4e0", fontSize: 11, fontFamily: "'Space Mono',monospace", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, transition: "all .2s", borderBottom: "2px solid transparent" },
  tabRowBtnActive: { color: "#f5e882", borderBottomColor: "#e8672a" },
  iconAction: { background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 10, width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff", transition: "background .2s" },
  logo: { fontSize: 24, background: "#e8672a", borderRadius: 8, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  tripName: { fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 15, color: "#f5e882" },
  tripMeta: { fontSize: 10, color: "#a8c4e0", marginTop: 1, fontFamily: "'DM Sans',sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  tabBar: { display: "flex", background: "#0f2470", borderRadius: 10, padding: 3, gap: 2 },
  tabBtn: { padding: "6px 10px", borderRadius: 8, border: "none", background: "none", color: "#a8c4e0", fontSize: 10, cursor: "pointer", fontFamily: "'Space Mono',monospace", whiteSpace: "nowrap" },
  tabBtnActive: { background: "#e8672a", color: "#fff", fontWeight: 700 },
  btnPrimary: { background: "#e8672a", color: "#fff", border: "none", borderRadius: 12, padding: "12px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap" },
  btnSecondary: { background: "#deeaf7", color: "#1a3a8f", border: "1px solid #a8c4e0", borderRadius: 12, padding: "12px 18px", fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap" },

  planLayout: { flex: 1, display: "flex", overflow: "hidden" },
  poolPanel: { width: "min(320px, 100%)", flexShrink: 0, background: "#c8dff5", borderRight: "1px solid #a8c4e0", display: "flex", flexDirection: "column", padding: 16, overflow: "hidden", transition: "all .2s" },
  schedulePanel: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  panelHead: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 },
  panelTitle: { fontFamily: "'Pacifico',cursive", fontWeight: 400, fontSize: 16, color: "#1a3a8f" },
  panelHint: { fontSize: 10, color: "#4a6fa5", marginBottom: 12, lineHeight: 1.5, fontFamily: "'Space Mono',monospace" },
  countBadge: { background: "#1a3a8f", color: "#f5e882", borderRadius: 20, padding: "1px 8px", fontSize: 11 },
  emptyState: { textAlign: "center", color: "#4a6fa5", padding: "40px 0", fontSize: 12, fontFamily: "'Space Mono',monospace" },

  dayTabs: { display: "flex", borderBottom: "1px solid #a8c4e0", background: "#c8dff5", overflowX: "auto", flexShrink: 0, scrollbarWidth: "none" },
  dayTab: { padding: "10px 14px", border: "none", background: "none", color: "#4a6fa5", fontSize: 10, cursor: "pointer", whiteSpace: "nowrap", borderBottom: "2px solid transparent", fontFamily: "'Space Mono',monospace", display: "flex", alignItems: "center", gap: 6, transition: "all .2s" },
  dayTabActive: { color: "#1a3a8f", borderBottomColor: "#e8672a" },
  dayCount: { background: "#e8672a22", color: "#e8672a", borderRadius: 10, padding: "1px 6px", fontSize: 10 },
  dayContent: { flex: 1, display: "flex", flexDirection: "column", padding: 16, overflow: "hidden", transition: "all .2s", borderRadius: 0, outline: "2px solid transparent", background: "#eaf3fc" },
  dayTitle: { fontFamily: "'Pacifico',cursive", fontWeight: 400, fontSize: 20, color: "#1a3a8f" },

  tlLine: { display: "flex", flexDirection: "column", alignItems: "center", width: 20, flexShrink: 0 },
  tlDot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0, marginTop: 16, border: "2px solid #0e0e0e" },
  tlConnector: { width: 2, flex: 1, background: "#a8c4e0", minHeight: 12 },

  dropHint: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#4a6fa5", fontSize: 12, textAlign: "center", border: "2px dashed #a8c4e0", borderRadius: 12, margin: 8, padding: 32, fontFamily: "'Space Mono',monospace" },

  ideaCard: { background: "#fff", border: "1px solid #deeaf7", borderLeft: "3px solid #555", borderRadius: 14, padding: "12px 14px", cursor: "grab", touchAction: "none", userSelect: "none", transition: "all .2s", boxShadow: "0 1px 4px rgba(26,58,143,0.06)" },
  ideaTitle: { fontSize: 13, color: "#1a3a8f", fontWeight: 500, lineHeight: 1.4, fontFamily: "'DM Sans',sans-serif" },
  ideaMeta: { fontSize: 11, color: "#4a6fa5", marginTop: 3, lineHeight: 1.4, fontFamily: "'DM Sans',sans-serif" },
  tag: { fontSize: 10, background: "#deeaf7", color: "#1a3a8f", borderRadius: 6, padding: "2px 6px" },
  mapsTag: { fontSize: 10, background: "#e8672a22", color: "#e8672a", borderRadius: 6, padding: "2px 6px", textDecoration: "none" },
  mapsBtn: { background: "#fff", color: "#e8672a", border: "1px solid #e8672a", borderRadius: 8, padding: "6px 12px", fontSize: 10, textDecoration: "none", whiteSpace: "nowrap", fontFamily: "'Space Mono',monospace" },
  bookedBadge: { fontSize: 10, background: "#10b98122", color: "#10b981", borderRadius: 6, padding: "1px 6px" },
  iconBtn: { background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: "2px 4px", opacity: 0.5, transition: "opacity .2s", lineHeight: 1 },

  // Budget
  budgetWrap: { flex: 1, overflow: "auto", padding: 20, background: "#deeaf7" },
  budgetSummary: { display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" },
  budgetStat: { background: "#fff", border: "1px solid #a8c4e0", borderRadius: 12, padding: "16px 24px", flex: 1, minWidth: 140 },
  budgetNum: { fontFamily: "'Pacifico',cursive", fontSize: 24, fontWeight: 400, color: "#e8672a" },
  budgetLabel: { fontSize: 10, color: "#4a6fa5", marginTop: 4, fontFamily: "'Space Mono',monospace" },
  budgetDayLabel: { fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: 11, color: "#1a3a8f", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 },
  budgetTable: { width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 10, overflow: "hidden", marginBottom: 4 },
  th: { padding: "8px 12px", fontSize: 10, color: "#4a6fa5", textAlign: "left", fontWeight: 700, fontFamily: "'Space Mono',monospace" },
  td: { padding: "10px 12px", fontSize: 12, color: "#1a3a8f", verticalAlign: "middle", fontFamily: "'Space Mono',monospace" },

  // Journey Map styles
  mapCard: { width: "min(100%, 380px)", borderRadius: 20, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 12px 32px rgba(26,58,143,.15)", flexShrink: 0, border: "1px solid rgba(255,255,255,0.4)" },
  mapCoverInner: { padding: "32px 24px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" },
  mapCoverTitle: { fontFamily: "'Pacifico',cursive", fontSize: 26, color: "#f5e882", marginBottom: 6, lineHeight: 1.3 },
  mapCoverDates: { fontFamily: "'Space Mono',monospace", fontSize: 11, color: "#a8c4e0", marginBottom: 4 },
  mapCoverStats: { display: "flex", alignItems: "center", gap: 12, marginTop: 16, background: "rgba(255,255,255,0.1)", borderRadius: 12, padding: "10px 20px" },
  mapStat: { textAlign: "center", fontFamily: "'Space Mono',monospace", fontSize: 10, color: "#a8c4e0", lineHeight: 1.8 },
  mapStatNum: { display: "block", fontFamily: "'Pacifico',cursive", fontSize: 22, color: "#f5e882", lineHeight: 1 },
  mapStatDivider: { color: "#a8c4e0", fontSize: 18, opacity: 0.4 },
  mapDayHeader: { padding: "12px 16px 8px", background: "rgba(255,255,255,0.7)", borderBottom: "1px solid rgba(255,255,255,0.5)", display: "flex", alignItems: "baseline", gap: 8, backdropFilter: "blur(4px)" },
  mapDayNum: { fontFamily: "'Pacifico',cursive", fontSize: 18, color: "#1a3a8f" },
  mapDayDate: { fontFamily: "'Space Mono',monospace", fontSize: 10, color: "#4a6fa5", flex: 1 },
  mapDayTrip: { fontFamily: "'Space Mono',monospace", fontSize: 9, color: "#a8c4e0" },
  mapDayFooter: { padding: "10px 16px", background: "rgba(255,255,255,0.7)", borderTop: "1px solid rgba(255,255,255,0.5)", display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "'Space Mono',monospace", fontSize: 10, color: "#4a6fa5" },

  // Story — vertical per-day 9:16 cards
  storyOuter: { flex: 1, overflow: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 20 },
  storyCoverCard: { width: "min(100%, 380px)", aspectRatio: "9/16", background: "linear-gradient(160deg, #1a3a8f 0%, #2a5298 50%, #a8c4e0 100%)", border: "1px solid #a8c4e0", borderRadius: 20, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(26,58,143,.3)", flexShrink: 0 },
  storyCoverInner: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 28, textAlign: "center" },
  storyCoverEmoji: { fontSize: 48, marginBottom: 12, background: "#e8672a", borderRadius: 16, width: 72, height: 72, display: "flex", alignItems: "center", justifyContent: "center" },
  storyCoverTitle: { fontFamily: "'Pacifico',cursive", fontWeight: 400, fontSize: 26, color: "#f5e882", lineHeight: 1.4, marginBottom: 8 },
  storyCoverDates: { fontSize: 12, color: "#f5e882", marginBottom: 4, fontFamily: "'Space Mono',monospace" },
  storyCoverMeta: { fontSize: 11, color: "#a8c4e0", fontFamily: "'Space Mono',monospace" },
  storyCoverTraveller: { fontSize: 11, background: "rgba(245,232,130,.2)", color: "#f5e882", borderRadius: 20, padding: "4px 12px", border: "1px solid rgba(245,232,130,.4)", fontFamily: "'Space Mono',monospace" },
  storyCoverLegend: { display: "flex", flexWrap: "wrap", gap: "6px 12px", justifyContent: "center", marginTop: 20, padding: "12px 8px", borderTop: "1px solid rgba(168,196,224,.3)" },
  storyCoverLegendItem: { display: "flex", alignItems: "center", gap: 4, fontFamily: "'Space Mono',monospace" },
  storyDayCard: { width: "min(100%, 380px)", background: "#fff", border: "1px solid #a8c4e0", borderRadius: 20, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 12px 32px rgba(26,58,143,.15)", flexShrink: 0 },
  storyDayCardHeader: { padding: "16px 20px 12px", background: "#1a3a8f", borderBottom: "1px solid #1230a0", display: "flex", alignItems: "baseline", justifyContent: "space-between" },
  storyDayNum: { fontFamily: "'Pacifico',cursive", fontWeight: 400, fontSize: 22, color: "#f5e882" },
  storyDayCardDate: { fontSize: 11, color: "#a8c4e0", fontFamily: "'Space Mono',monospace" },
  storyDayCardTrip: { fontSize: 10, color: "#a8c4e0", textAlign: "right", fontFamily: "'Space Mono',monospace" },
  storyDayStayBanner: { display: "flex", alignItems: "center", gap: 10, background: "#f0f6ff", borderBottom: "1px solid #a8c4e0", padding: "10px 20px" },
  storyDayStops: { flex: 1, padding: "16px 20px", display: "flex", flexDirection: "column", background: "#fff" },
  storyDayCardFooter: { padding: "10px 20px", borderTop: "1px solid #deeaf7", display: "flex", justifyContent: "space-between", background: "#f0f6ff" },
  storyMapBtn: { background: "#e8672a", color: "#fff", border: "none", borderRadius: 8, padding: "4px 10px", fontSize: 10, textDecoration: "none", flexShrink: 0, whiteSpace: "nowrap", fontFamily: "'Space Mono',monospace" },
  storyChip: { fontSize: 10, background: "#deeaf7", color: "#1a3a8f", borderRadius: 6, padding: "2px 6px", fontFamily: "'Space Mono',monospace" },
  storyLink: { fontSize: 9, color: "#e8672a", textDecoration: "none", marginLeft: 4 },
  storyTraveller: { fontSize: 10, background: "#e8672a22", color: "#e8672a", borderRadius: 10, padding: "2px 8px" },

  // Forms
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(4px)" },
  modal: { background: "#fff", border: "1px solid #a8c4e0", borderRadius: 20, width: "min(calc(100vw - 24px), 540px)", maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden" },
  modalHeader: { display: "flex", alignItems: "center", gap: 10, padding: "16px 20px", borderBottom: "1px solid #deeaf7", flexShrink: 0, background: "#1a3a8f" },
  modalTitle: { fontFamily: "'Pacifico',cursive", fontWeight: 400, fontSize: 18, color: "#f5e882", flex: 1 },
  closeBtn: { background: "none", border: "none", color: "#a8c4e0", cursor: "pointer", fontSize: 18, lineHeight: 1 },
  formGrid: { flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 12, background: "#fff" },
  formFull: { display: "flex", flexDirection: "column", gap: 4 },
  formHalf: { display: "flex", flexDirection: "column", gap: 4, flex: 1 },
  modalFooter: { display: "flex", alignItems: "center", padding: "12px 20px", borderTop: "1px solid #deeaf7", gap: 8, flexShrink: 0, background: "#f0f6ff" },
  label: { fontSize: 10, color: "#4a6fa5", textTransform: "uppercase", letterSpacing: ".5px", fontWeight: 700, fontFamily: "'Space Mono',monospace" },
  input: { background: "#f0f6ff", border: "1.5px solid #a8c4e0", borderRadius: 10, padding: "12px 14px", fontSize: 14, color: "#1a3a8f", fontFamily: "'DM Sans',sans-serif", outline: "none", width: "100%", transition: "border-color .2s", WebkitAppearance: "none" },
  catChip: { border: "none", borderRadius: 20, padding: "5px 12px", fontSize: 11, cursor: "pointer", fontFamily: "'Space Mono',monospace", transition: "all .2s" },

  // Trip setup
  setupScreen: { height: "100vh", background: "linear-gradient(135deg, #1a3a8f 0%, #a8c4e0 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
  setupCard: { background: "#fff", border: "1px solid #a8c4e0", borderRadius: 20, padding: 32, width: "min(100%, 480px)", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(26,58,143,.2)" },
  setupTitle: { fontFamily: "'Pacifico',cursive", fontWeight: 400, fontSize: 28, color: "#1a3a8f", marginTop: 8 },
  travChip: { background: "#deeaf7", color: "#1a3a8f", borderRadius: 20, padding: "4px 12px", fontSize: 11, display: "flex", alignItems: "center", fontFamily: "'Space Mono',monospace" },

  // Stay banner
  stayBanner: { background: "#f0f6ff", border: "1px solid #a8c4e0", borderLeft: "3px solid #6366f1", borderRadius: 10, padding: "10px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 },

  // Save button
  saveBtn: { background: "#f5e882", color: "#1a3a8f", border: "1px solid #f5e882", borderRadius: 8, padding: "8px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'Space Mono',monospace", whiteSpace: "nowrap", transition: "all .2s" },
  saveBtnSaved: { background: "#d1fae5", color: "#065f46", borderColor: "#6ee7b7" },
  saveBtnError: { background: "#fee2e2", color: "#991b1b", borderColor: "#fca5a5" },

  // Mobile nav
  mobileNav: { background: "#fff", borderTop: "1px solid #deeaf7", display: "none", flexShrink: 0, paddingBottom: "env(safe-area-inset-bottom, 0px)" },
  mnavBtn: { flex: 1, padding: "10px 4px", border: "none", background: "none", color: "#a8c4e0", fontSize: 10, fontFamily: "'DM Sans',sans-serif", fontWeight: 500, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, transition: "color .2s" },
  mnavActive: { color: "#1a3a8f" },
};
