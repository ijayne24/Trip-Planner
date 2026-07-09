import React from 'react';
import { useState, useEffect, useRef, useCallback } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const STORAGE_KEY = "tripplanner-v2";
const TRIPS_INDEX_KEY = "tripplanner-trips-index";

const CATEGORIES = [
  { id: "flight",       label: "Flight",       icon: "🛫",  color: "#0369a1" },
  { id: "transport",    label: "Transport",    icon: "🚖",  color: "#1B2B4B" },
  { id: "food",         label: "Food & Drink", icon: "🍜",  color: "#C85A2A" },
  { id: "activity",     label: "Activity",     icon: "🎯",  color: "#0ea5e9" },
  { id: "accommodation",label: "Stay",         icon: "🏨",  color: "#9B8EC4" },
  { id: "monument",     label: "Sights",       icon: "🏛️",  color: "#f59e0b" },
  { id: "shopping",     label: "Shopping",     icon: "🛍️",  color: "#C85A2A" },
  { id: "misc",         label: "Other",        icon: "📍",  color: "#C9B8A8" },
];

const CAT = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

const uid = () => `id-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// Clean a stop title for use as a Google Maps search waypoint
function cleanForMaps(title) {
  return encodeURIComponent(title.replace(/^[^a-zA-Z]*/, "").trim());
}

// Build a Google Maps multi-stop directions URL — only uses real map links
function buildDayRouteUrl(stops) {
  const withLinks = stops.filter(s => s.mapsUrl && s.mapsUrl.trim());
  if (!withLinks.length) return null;
  if (withLinks.length === 1) return withLinks[0].mapsUrl;
  // Use the map URLs directly as waypoints
  return `https://www.google.com/maps/dir/${withLinks.map(s => encodeURIComponent(s.mapsUrl)).join("/")}`;
}

// Detect which map app a URL leads to
function mapLabel(url) {
  if (!url) return null;
  if (url.includes("amap.com") || url.includes("gaode.com") || url.includes("amapurl.amap.com")) return { label: "AMap", icon: "📍", color: "#00B4FF" };
  if (url.includes("maps.apple.com")) return { label: "Apple Maps", icon: "🗺", color: "#34C759" };
  return { label: "Map", icon: "🗺", color: "#C85A2A" };
}

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

// ─── Parse Google Maps URL to extract place name ─────────────────────────────
function parseGoogleMapsUrl(url) {
  try {
    // Handle maps.google.com/maps/place/Place+Name/@lat,lng
    const placeMatch = url.match(/\/place\/([^/@?]+)/);
    if (placeMatch) {
      return decodeURIComponent(placeMatch[1].replace(/\+/g, " ")).replace(/\//g, "").trim();
    }
    // Handle ?q=Place+Name
    const qMatch = url.match(/[?&]q=([^&]+)/);
    if (qMatch) {
      return decodeURIComponent(qMatch[1].replace(/\+/g, " ")).trim();
    }
    // Handle search?query=Place+Name
    const queryMatch = url.match(/query=([^&]+)/);
    if (queryMatch) {
      return decodeURIComponent(queryMatch[1].replace(/\+/g, " ")).trim();
    }
  } catch {}
  return null;
}

function isUrl(str) {
  return str.startsWith("http://") || str.startsWith("https://") || str.startsWith("maps.");
}

// ─── IdeaForm modal ───────────────────────────────────────────────────────────
function IdeaForm({ idea, tripDates, travellers, onSave, onCancel }) {
  const [form, setForm] = useState(idea ? {
    title: "", category: "activity", date: "", checkOut: "", time: "",
    cost: "", currency: "SGD", place: "", mapsUrl: "", infoUrl: "", notes: "",
    paidBy: "", splitBetween: [], bookedStatus: "not-booked",
    flightNum: "", departTerminal: "", arrivalDate: "", arrivalTime: "", arrivalAirport: "",
    ...idea,                    // spread existing idea values
    infoUrl: idea.infoUrl || "", // ensure infoUrl is never undefined
    mapsUrl: idea.mapsUrl || "",
    splitBetween: idea.splitBetween || [],
  } : {
    title: "", category: "activity", date: "", checkOut: "", time: "",
    cost: "", currency: "SGD", place: "", mapsUrl: "", infoUrl: "", notes: "",
    paidBy: "", splitBetween: [], bookedStatus: "not-booked",
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
          {/* Title / URL smart input */}
          <div style={styles.formFull}>
            <label style={styles.label}>What is it? *</label>
            <input style={styles.input}
              placeholder="Name or paste a Google Maps / website link..."
              value={form.title}
              autoFocus
              onChange={e => {
                const val = e.target.value;
                set("title", val);
              }}
              onPaste={e => {
                const pasted = e.clipboardData.getData("text").trim();
                if (isUrl(pasted)) {
                  e.preventDefault();
                  // It's a URL — put it in mapsUrl and try to extract a name
                  const extracted = parseGoogleMapsUrl(pasted);
                  setForm(f => ({
                    ...f,
                    mapsUrl: pasted,
                    title: extracted || f.title,
                  }));
                }
              }}
              onKeyDown={e => { if (e.key === "Enter" && form.title.trim()) onSave({ ...form, id: idea?.id || uid() }); }} />
            {form.mapsUrl && form.title && (
              <div style={{ fontSize: 11, color: "#10b981", marginTop: 4, fontFamily: "'Inter',sans-serif", display: "flex", alignItems: "center", gap: 4 }}>
                ✓ Link saved · <a href={form.mapsUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#C85A2A" }}>preview</a>
              </div>
            )}
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
            <label style={styles.label}>Total Cost</label>
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

          {/* Split between */}
          <div style={styles.formFull}>
            <label style={styles.label}>Split between</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
              {(travellers || []).length === 0 && <span style={{ fontSize: 12, color: "#6B7A90", fontFamily: "'Inter',sans-serif" }}>Add travellers to your trip first</span>}
              {(travellers || []).map(t => {
                const selected = form.splitBetween?.includes(t) ?? false;
                return (
                  <button key={t} type="button"
                    style={{ padding: "6px 12px", borderRadius: 20, border: "1.5px solid", fontSize: 12, cursor: "pointer", fontFamily: "'Inter',sans-serif", fontWeight: 500,
                      background: selected ? "#1B2B4B" : "#FAF7F2",
                      color: selected ? "#fff" : "#1B2B4B",
                      borderColor: selected ? "#1B2B4B" : "#C9B8A8" }}
                    onClick={() => {
                      const current = form.splitBetween || [];
                      set("splitBetween", selected ? current.filter(x => x !== t) : [...current, t]);
                    }}>
                    {selected ? "✓ " : ""}{t}
                  </button>
                );
              })}
              {(travellers || []).length > 0 && (
                <button type="button"
                  style={{ padding: "6px 12px", borderRadius: 20, border: "1.5px solid #C9B8A8", fontSize: 12, cursor: "pointer", fontFamily: "'Inter',sans-serif", color: "#6B7A90", background: "#FAF7F2" }}
                  onClick={() => set("splitBetween", form.splitBetween?.length === travellers.length ? [] : [...travellers])}>
                  {form.splitBetween?.length === travellers.length ? "Deselect all" : "Select all"}
                </button>
              )}
            </div>
            {form.cost && form.splitBetween?.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#6B7A90", fontFamily: "'Inter',sans-serif" }}>
                = {form.currency} {(parseFloat(form.cost) / form.splitBetween.length).toFixed(2)} per person ({form.splitBetween.length} pax)
              </div>
            )}
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
          {/* Maps + More Info side by side */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <label style={styles.label}>Google Maps / AMap link</label>
              <input style={{ ...styles.input, marginTop: 6, ...(form.mapsUrl ? { borderColor: "#10b981" } : {}) }}
                placeholder="Paste Google Maps or AMap (高德) link..."
                value={form.mapsUrl}
                onChange={e => set("mapsUrl", e.target.value)}
                onPaste={e => {
                  const pasted = e.clipboardData.getData("text").trim();
                  if (isUrl(pasted) && !form.title) {
                    const extracted = parseGoogleMapsUrl(pasted);
                    if (extracted) setForm(f => ({ ...f, title: extracted }));
                  }
                }} />
            </div>
            <div>
              <label style={styles.label}>More Info link <span style={{ color: "#C9B8A8", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>— TikTok, article, booking page...</span></label>
              <input style={{ ...styles.input, marginTop: 6, ...(form.infoUrl ? { borderColor: "#9B8EC4" } : {}) }}
                placeholder="https://tiktok.com/... or booking link"
                value={form.infoUrl || ""}
                onChange={e => set("infoUrl", e.target.value)} />
            </div>
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
    <div style={{ ...styles.ideaCard, borderLeftColor: cat.color, opacity: 1, cursor: "default", userSelect: "none", WebkitUserSelect: "none" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        {/* Drag handle — big enough to tap comfortably */}
        <div
          draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd}
          onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, width: 28, minHeight: 44, padding: "0 6px", cursor: "grab", flexShrink: 0, touchAction: "none", userSelect: "none", WebkitUserSelect: "none", opacity: 0.3 }}>
          <div style={{ width: 16, height: 2, borderRadius: 2, background: "#1B2B4B" }} />
          <div style={{ width: 16, height: 2, borderRadius: 2, background: "#1B2B4B" }} />
          <div style={{ width: 16, height: 2, borderRadius: 2, background: "#1B2B4B" }} />
        </div>
        <span style={{ fontSize: 18, flexShrink: 0, marginTop: 2 }}>{cat.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={styles.ideaTitle}>{idea.title}</span>
            {idea.bookedStatus === "booked" && <span style={styles.bookedBadge}>✅ Booked</span>}
            {idea.bookedStatus === "need-to-book" && <span style={{ ...styles.bookedBadge, background: "#f59e0b22", color: "#f59e0b" }}>📋 To Book</span>}
          </div>
          {!compact && idea.place && <div style={styles.ideaMeta}>📍 {idea.place}</div>}
          {!compact && idea.notes && <div style={{ ...styles.ideaMeta, fontStyle: "italic" }}>{idea.notes}</div>}
          {/* Flight-specific details */}
          {idea.category === "flight" && (idea.time || idea.arrivalTime || idea.arrivalAirport) && (
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
              {idea.time && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ ...styles.tag, background: "#FAF7F2", color: "#0369a1", fontWeight: 600 }}>
                    🛫 Departs {idea.time}{idea.departTerminal ? ` · ${idea.departTerminal}` : ""}{idea.flightNum ? ` · ${idea.flightNum}` : ""}
                  </span>
                </div>
              )}
              {(idea.arrivalTime || idea.arrivalAirport) && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ ...styles.tag, background: "#FAF7F2", color: "#0369a1", fontWeight: 600 }}>
                    🛬 Arrives {idea.arrivalTime ? `${idea.arrivalTime} · ` : ""}{idea.arrivalAirport || ""}
                  </span>
                </div>
              )}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
            {idea.category !== "flight" && idea.time && <span style={styles.tag}>🕐 {idea.time}</span>}
            {idea.cost && <span style={styles.tag}>💰 {idea.cost} {idea.currency}{idea.splitBetween?.length > 0 ? ` ÷${idea.splitBetween.length}` : ""}</span>}
            {idea.paidBy && <span style={styles.tag}>👤 {idea.paidBy}</span>}
            {idea.mapsUrl && (() => { const ml = mapLabel(idea.mapsUrl); return <a href={idea.mapsUrl} target="_blank" rel="noopener noreferrer" style={{ ...styles.mapsTag, background: ml.color + "18", color: ml.color }} onClick={e => e.stopPropagation()}>{ml.icon} {ml.label}</a>; })()}
            {idea.infoUrl?.trim() && <a href={idea.infoUrl} target="_blank" rel="noopener noreferrer" style={{ ...styles.mapsTag, background: "#9B8EC422", color: "#9B8EC4" }} onClick={e => e.stopPropagation()}>🔗 More</a>}
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



// ─── Sample trips data ────────────────────────────────────────────────────────
const SAMPLE_TRIPS = [
  {
    id: "sample-singapore-layover",
    name: "One Day Layover in Singapore",
    emoji: "🦁",
    description: "A packed Katong & Joo Chiat day — coffee, Peranakan culture, street murals, record stores, desserts, and sunset views at Marina Bay Sands.",
    tags: ["Free", "1–2 Days", "Solo or Group"],
    duration: "1-2 days",
    price: 0,
    color: "#C85A2A",
    trip: { name: "One Day Layover in Singapore", start: "", end: "", travellers: [], currency: "SGD", dates: [] },
    ideas: [
      { id: "sg-stay", title: "Crown Plaza", category: "accommodation", date: "", checkOut: "", time: "", place: "", mapsUrl: "https://maps.app.goo.gl/zekaMfJ8Jhj7SJANA?g_st=ic", infoUrl: "", notes: "", cost: "", currency: "SGD", bookedStatus: "not-booked", splitBetween: [], paidBy: "" },
      { id: "sg-1", title: "Sunset views at Lavo at Marina Bay Sands", category: "food", time: "19:00", place: "", mapsUrl: "https://maps.app.goo.gl/ASTx8ZiMEsXmU1Bv7?g_st=ic", infoUrl: "", notes: "Get reservations at Lavo or Spago to head to the top of the iconic Marina Bay Sands without paying for the observation deck prices!", cost: "", currency: "SGD", bookedStatus: "need-to-book", splitBetween: [], paidBy: "" },
      { id: "sg-2", title: "Grab coffee at this hole-in-the-wall Kopi Khoo store", category: "food", time: "", place: "", mapsUrl: "https://maps.app.goo.gl/VZbkFtM1vxSFV7VP6?g_st=ic", infoUrl: "", notes: "", cost: "", currency: "SGD", bookedStatus: "not-booked", splitBetween: [], paidBy: "" },
      { id: "sg-3", title: "Snap some photos at the Peranakan Houses", category: "activity", time: "", place: "", mapsUrl: "https://maps.app.goo.gl/NBNWqDv9exBHG2jv6?g_st=ic", infoUrl: "", notes: "", cost: "", currency: "SGD", bookedStatus: "not-booked", splitBetween: [], paidBy: "" },
      { id: "sg-4", title: "Check out Tiger and Arcadia", category: "shopping", time: "", place: "", mapsUrl: "https://maps.app.goo.gl/UnsSynYYURMT8AXX9?g_st=ic", infoUrl: "", notes: "", cost: "", currency: "SGD", bookedStatus: "not-booked", splitBetween: [], paidBy: "" },
      { id: "sg-5", title: "Check out the murals of Joo Chiat", category: "monument", time: "", place: "", mapsUrl: "https://maps.app.goo.gl/K6YzFRrUysTQvaB16?g_st=ic", infoUrl: "", notes: "", cost: "", currency: "SGD", bookedStatus: "not-booked", splitBetween: [], paidBy: "" },
      { id: "sg-6", title: "Local souvenirs at Cat Socretes", category: "shopping", time: "", place: "", mapsUrl: "https://maps.app.goo.gl/FiPcf6k2BmxTVPtLA?g_st=ic", infoUrl: "", notes: "", cost: "", currency: "SGD", bookedStatus: "not-booked", splitBetween: [], paidBy: "" },
      { id: "sg-7", title: "Check out records at Retro Crates", category: "shopping", time: "", place: "", mapsUrl: "https://maps.app.goo.gl/UrE4YBQTkpjzniHPA?g_st=ic", infoUrl: "", notes: "", cost: "", currency: "SGD", bookedStatus: "not-booked", splitBetween: [], paidBy: "" },
      { id: "sg-8", title: "Learn about Peranakan Culture at Kim Choo", category: "activity", time: "", place: "", mapsUrl: "https://maps.app.goo.gl/i5tLThEAgFs6jf1h6?g_st=ic", infoUrl: "", notes: "", cost: "", currency: "SGD", bookedStatus: "not-booked", splitBetween: [], paidBy: "" },
      { id: "sg-9", title: "Dessert: Birds of Paradise ice cream", category: "food", time: "", place: "", mapsUrl: "https://maps.app.goo.gl/7MEMy1TCqv5FQE9E7?g_st=ic", infoUrl: "", notes: "Be sure to try their thyme-infused cones and cool off with their refreshing flavors!", cost: "", currency: "SGD", bookedStatus: "not-booked", splitBetween: [], paidBy: "" },
      { id: "sg-10", title: "Dessert: Aunty Peng's Banana Pie", category: "food", time: "", place: "", mapsUrl: "https://maps.app.goo.gl/XSHQAeD3bJBeZSE96?g_st=ic", infoUrl: "", notes: "Try a slice and also ask for the mini chocolate tarts.", cost: "", currency: "SGD", bookedStatus: "not-booked", splitBetween: [], paidBy: "" },
      { id: "sg-11", title: "Lunch: Chicken rice at Katong Mei Wei", category: "food", time: "", place: "Katong Shopping Center", mapsUrl: "https://maps.app.goo.gl/ZvPB1bKf49DceN3r9?g_st=ic", infoUrl: "https://vt.tiktok.com/ZSCKGLR1V/", notes: "Pay with cash, order the roasted chicken! Tell them how many people you have and your preferred part of the chicken to eat.", cost: "", currency: "SGD", bookedStatus: "not-booked", splitBetween: [], paidBy: "" },
      { id: "sg-12", title: "Wander around Jewel Changi", category: "activity", time: "", place: "", mapsUrl: "", infoUrl: "https://vt.tiktok.com/ZSCKsEVQo/", notes: "You can drop your bags off and check in at Jewel and wander around before heading into the transit area!", cost: "", currency: "SGD", bookedStatus: "not-booked", splitBetween: [], paidBy: "" },
    ]
  },
];

// ─── TripMarketplace ──────────────────────────────────────────────────────────
function TripMarketplace({ onLoadTrip, onClose }) {
  const [selected, setSelected] = React.useState(null);

  const handleLoad = (sample) => {
    // Create a new trip from the sample, stripping dates so user sets their own
    const newTrip = {
      ...sample.trip,
      id: uid(),
      dates: [],
    };
    const newIdeas = sample.ideas.map(i => ({ ...i, id: uid(), date: "", time: i.time || "" }));
    onLoadTrip(newTrip, newIdeas);
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={{ ...styles.modal, maxWidth: 520, maxHeight: "88vh" }} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <span style={{ fontSize: 22 }}>🦩</span>
          <span style={styles.modalTitle}>Sample Trips</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: "12px 16px 6px", background: "#FAF7F2", borderBottom: "1px solid #EDE8E1", flexShrink: 0 }}>
          <p style={{ fontSize: 13, color: "#6B7A90", fontFamily: "'Inter',sans-serif", lineHeight: 1.5 }}>
            Load a sample trip as a starting point — all ideas go into your pool with no dates, ready for you to schedule.
          </p>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10, background: "#FAF7F2" }}>
          {SAMPLE_TRIPS.map(sample => (
            <div key={sample.id}
              style={{ background: "#fff", border: `1.5px solid ${selected?.id === sample.id ? sample.color : "#EDE8E1"}`, borderRadius: 16, padding: "14px 16px", cursor: "pointer", transition: "all .15s", boxShadow: selected?.id === sample.id ? `0 0 0 3px ${sample.color}22` : "0 1px 4px rgba(27,43,75,0.06)" }}
              onClick={() => setSelected(selected?.id === sample.id ? null : sample)}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: sample.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                  {sample.emoji}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 15, color: "#1B2B4B", marginBottom: 3 }}>{sample.name}</div>
                    <button style={{ background: "#F0EBE3", border: "none", borderRadius: 8, padding: "4px 10px", fontSize: 11, color: "#C85A2A", fontWeight: 700, cursor: "pointer", flexShrink: 0, fontFamily: "'Inter',sans-serif" }}
                      onClick={e => { e.stopPropagation(); exportSampleHTML(sample); }}>
                      ⬇ HTML
                    </button>
                  </div>
                  <div style={{ fontSize: 12, color: "#6B7A90", lineHeight: 1.5, marginBottom: 8 }}>{sample.description}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {sample.tags.map(t => (
                      <span key={t} style={{ fontSize: 11, background: "#F0EBE3", color: "#1B2B4B", borderRadius: 100, padding: "2px 10px", fontWeight: 500 }}>{t}</span>
                    ))}
                    <span style={{ fontSize: 11, background: "#F0EBE3", color: "#6B7A90", borderRadius: 100, padding: "2px 10px" }}>{sample.ideas.length} stops</span>
                  </div>
                </div>
              </div>
              {selected?.id === sample.id && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #EDE8E1" }}>
                  <div style={{ fontSize: 12, color: "#6B7A90", marginBottom: 8, fontFamily: "'Inter',sans-serif" }}>Included stops:</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {sample.ideas.slice(0, 4).map(i => {
                      const cat = CAT[i.category] || CAT.misc;
                      return (
                        <div key={i.id} style={{ fontSize: 12, color: "#1B2B4B", display: "flex", alignItems: "center", gap: 6 }}>
                          <span>{cat.icon}</span> {i.title}
                          {i.time && <span style={{ color: "#6B7A90", fontSize: 11 }}>· {i.time}</span>}
                        </div>
                      );
                    })}
                    {sample.ideas.length > 4 && <div style={{ fontSize: 11, color: "#C9B8A8" }}>+{sample.ideas.length - 4} more stops...</div>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ ...styles.modalFooter, flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, width: "100%" }}>
            <button style={{ ...styles.btnSecondary, flex: 1, opacity: selected ? 1 : 0.4, pointerEvents: selected ? "auto" : "none", fontSize: 13, padding: "11px 12px" }}
              onClick={() => selected && exportSampleHTML(selected)}>
              ⬇ Download itinerary
            </button>
            <button style={{ ...styles.btnPrimary, flex: 1, opacity: selected ? 1 : 0.4, pointerEvents: selected ? "auto" : "none", fontSize: 13, padding: "11px 12px" }}
              onClick={() => selected && handleLoad(selected)}>
              Load into my Flokk →
            </button>
          </div>
          <div style={{ fontSize: 11, color: "#C9B8A8", textAlign: "center", fontFamily: "'Inter',sans-serif" }}>More curated trips coming soon 🦩</div>
        </div>
      </div>
    </div>
  );
}

// ─── TripDashboard ────────────────────────────────────────────────────────────
function TripDashboard({ onSelect, onNew, onSample }) {
  const [trips, setTrips] = React.useState([]);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(TRIPS_INDEX_KEY);
      if (raw) setTrips(JSON.parse(raw));
    } catch {}
    setLoaded(true);
  }, []);

  if (!loaded) return null;

  return (
    <div style={dashStyles.screen}>
      {/* Coastal illustrated hero — cobalt blue with SVG shapes */}
      <div style={dashStyles.hero}>
        {/* Decorative SVG shapes */}
        <svg style={{ position:"absolute", inset:0, width:"100%", height:"100%" }} viewBox="0 0 390 320" preserveAspectRatio="xMidYMid slice">
          {/* Sun */}
          <circle cx="320" cy="60" r="55" fill="#F5E882" opacity="0.9"/>
          {/* Cloud shapes */}
          <ellipse cx="60" cy="40" rx="45" ry="28" fill="white" opacity="0.15"/>
          <ellipse cx="95" cy="30" rx="35" ry="22" fill="white" opacity="0.15"/>
          {/* Wave 1 */}
          <path d="M0 200 Q60 170 120 200 Q180 230 240 200 Q300 170 360 200 Q390 215 390 215 L390 320 L0 320 Z" fill="#C85A2A" opacity="0.85"/>
          {/* Wave 2 */}
          <path d="M0 230 Q80 205 160 230 Q240 255 320 230 Q360 218 390 228 L390 320 L0 320 Z" fill="#F0EBE3" opacity="0.6"/>
          {/* Wave 3 */}
          <path d="M0 260 Q100 240 200 260 Q300 280 390 255 L390 320 L0 320 Z" fill="#fff" opacity="0.9"/>
          {/* Airplane */}
          <text x="30" y="140" fontSize="36" opacity="0.9">✈️</text>
          {/* Stars */}
          <text x="200" y="50" fontSize="14" opacity="0.6">✦</text>
          <text x="150" y="80" fontSize="10" opacity="0.4">✦</text>
          <text x="260" y="90" fontSize="8" opacity="0.5">✦</text>
        </svg>
        <div style={dashStyles.heroContent}>
          <div style={{ fontFamily: "'Pacifico',cursive", fontSize: 42, color: "#F5E882", lineHeight: 1.1, marginBottom: 4 }}>Flokk 🦩</div>
          <div style={dashStyles.heroSub}>Where does your flock want to go?</div>
        </div>
      </div>

      {/* Trip cards */}
      <div style={dashStyles.body}>
        {trips.length === 0 ? (
          <div style={dashStyles.empty}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>{"🗺️"}</div>
            <div style={{ fontFamily: "'Pacifico',cursive", fontSize: 22, color: "#1B2B4B", marginBottom: 8 }}>No trips yet!</div>
            <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: "#6B7A90" }}>Tap below to plan your first adventure</div>
          </div>
        ) : (
          trips.map(trip => (
            <div key={trip.id} style={dashStyles.tripCard} onClick={() => onSelect(trip.id)}>
              <div style={dashStyles.tripIcon}>{"✈️"}</div>
              <div style={dashStyles.tripCardBody}>
                <div style={dashStyles.tripName}>{trip.name}</div>
                <div style={dashStyles.tripMeta}>{fmtDate(trip.start)} – {fmtDate(trip.end)}</div>
                <div style={dashStyles.tripStats}>
                  <span style={dashStyles.tripStat}>{"👥"} {trip.travellers?.length || 0}</span>
                  <span style={dashStyles.tripStat}>{"📍"} {trip.ideaCount || 0} stops</span>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button onClick={e => {
                  e.stopPropagation();
                  if (window.confirm('Delete ' + trip.name + '? This cannot be undone.')) {
                    try {
                      localStorage.removeItem('trip-' + trip.id);
                      const raw = localStorage.getItem(TRIPS_INDEX_KEY);
                      if (raw) localStorage.setItem(TRIPS_INDEX_KEY, JSON.stringify(JSON.parse(raw).filter(t => t.id !== trip.id)));
                      setTrips(t => t.filter(t2 => t2.id !== trip.id));
                    } catch {}
                  }
                }} style={{ background: 'none', border: 'none', color: '#C9B8A8', cursor: 'pointer', fontSize: 16, padding: '4px 8px' }}>🗑</button>
                <div style={{ fontSize: 22, color: "#C9B8A8", fontWeight: 300 }}>›</div>
              </div>
            </div>
          ))
        )}
      </div>

      <div style={dashStyles.footer}>
        <button style={dashStyles.newBtn} onClick={onNew}>＋ Plan a New Trip</button>
        <button style={dashStyles.sampleBtn} onClick={onSample}>🦩 Browse Sample Trips</button>
      </div>
    </div>
  );
}

const dashStyles = {
  screen: { minHeight: "100dvh", background: "#FAF7F2", display: "flex", flexDirection: "column" },
  hero: { position: "relative", background: "#1B2B4B", height: 300, overflow: "hidden", flexShrink: 0 },
  heroContent: { position: "relative", zIndex: 2, padding: "56px 28px 0", textAlign: "left" },
  heroTitle: { fontFamily: "'Pacifico',cursive", fontSize: 36, color: "#F5E882", lineHeight: 1.2 },
  heroSub: { fontFamily: "'Inter',sans-serif", fontSize: 15, color: "rgba(255,255,255,0.8)", marginTop: 6 },
  body: { flex: 1, padding: "20px 16px 8px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" },
  empty: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center" },
  tripCard: { background: "#fff", borderRadius: 20, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer", boxShadow: "0 2px 16px rgba(26,58,143,0.08)", borderLeft: "4px solid #C85A2A" },
  tripIcon: { width: 52, height: 52, background: "#FAF7F2", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0 },
  tripCardBody: { flex: 1, minWidth: 0 },
  tripName: { fontFamily: "'Pacifico',cursive", fontSize: 18, color: "#1B2B4B", marginBottom: 3 },
  tripMeta: { fontFamily: "'Inter',sans-serif", fontSize: 12, color: "#6B7A90", marginBottom: 6 },
  tripStats: { display: "flex", gap: 12 },
  tripStat: { fontFamily: "'Inter',sans-serif", fontSize: 12, color: "#C9B8A8", background: "#FAF7F2", padding: "2px 8px", borderRadius: 10 },
  footer: { padding: "16px", paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))", display: "flex", flexDirection: "column", gap: 10 },
  sampleBtn: { width: "100%", padding: "14px", background: "#FAF7F2", color: "#1B2B4B", border: "1.5px solid #EDE8E1", borderRadius: 18, fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  newBtn: { width: "100%", padding: "18px", background: "#C85A2A", color: "#fff", border: "none", borderRadius: 18, fontFamily: "'Inter',sans-serif", fontSize: 16, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 16px rgba(232,103,42,0.3)" },
};

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
      <div style={{ width: "100%", maxWidth: 480 }}>
        <div style={styles.setupCard}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontFamily: "'Pacifico',cursive", fontSize: 30, color: "#1B2B4B", marginBottom: 4 }}>Trip Planner {"✈️"}</div>
          <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: "#6B7A90" }}>Plan. Share. Explore.</div>
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
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
            <p style={{ fontSize: 10, color: "#6B7A90", marginTop: 4, fontFamily: "'Inter',sans-serif" }}>Separate multiple names with commas</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {travellers.map(t => (
                <span key={t} style={styles.travChip}>{t}
                  <button onClick={() => setTravellers(ts => ts.filter(x => x !== t))} style={{ background: "none", border: "none", color: "#f59e0b", cursor: "pointer", marginLeft: 4 }}>✕</button>
                </span>
              ))}
            </div>
          </div>
        </div>

        <button style={{ ...styles.btnPrimary, width: "100%", marginTop: 28, padding: "16px", fontSize: 16, borderRadius: 16 }}
          disabled={!name || !start || !end}
          onClick={() => onDone({ name, start, end, travellers, currency })}>
          Start Planning →
        </button>
        </div>
      </div>
    </div>
  );
}

// ─── BudgetSheet ──────────────────────────────────────────────────────────────
function BudgetSheet({ ideas, travellers, currency }) {
  const costItems = ideas.filter(i => i.cost && parseFloat(i.cost) > 0);
  const total = costItems.reduce((s, i) => s + parseFloat(i.cost || 0), 0);
  // Per person = sum of each item divided by its own split count
  const perPerson = costItems.reduce((s, i) => {
    const splitCount = i.splitBetween?.length || travellers.length || 1;
    return s + parseFloat(i.cost || 0) / splitCount;
  }, 0);

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
                    <td style={{ ...styles.td, textAlign: "right" }}>
                      <div style={{ color: "#C85A2A", fontWeight: 600 }}>{fmtCurrency(parseFloat(item.cost), item.currency)}</div>
                      {item.splitBetween?.length > 0 && (
                        <div style={{ fontSize: 10, color: "#6B7A90", marginTop: 2 }}>
                          ÷{item.splitBetween.length} = {fmtCurrency(parseFloat(item.cost) / item.splitBetween.length, item.currency)}/pax
                        </div>
                      )}
                    </td>
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
// ─── Export a sample trip as standalone HTML ──────────────────────────────────
function exportSampleHTML(sample) {
  const catMap = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

  const stopCards = sample.ideas.map((item, i) => {
    const cat = catMap[item.category] || catMap.misc;
    return `
      <div class="stop-row">
        <div class="stop-spine">
          <div class="stop-dot" style="background:${cat.color}">${i + 1}</div>
          ${i < sample.ideas.length - 1 ? '<div class="stop-line"></div>' : ''}
        </div>
        <div class="stop-body${i < sample.ideas.length - 1 ? ' stop-body-mb' : ''}">
          <div class="stop-title">${cat.icon} ${item.title}</div>
          ${item.place ? `<div class="stop-place">📍 ${item.place}</div>` : ''}
          ${item.notes ? `<div class="stop-notes">${item.notes}</div>` : ''}
          <div class="stop-chips">
            ${item.time ? `<span class="chip">🕐 ${item.time}</span>` : ''}
            ${item.cost ? `<span class="chip chip-cost">💰 ${item.cost} ${item.currency}</span>` : ''}
            ${item.mapsUrl ? `<a href="${item.mapsUrl}" class="map-btn" target="_blank">🗺 Map</a>` : ''}
            ${item.infoUrl?.trim() ? `<a href="${item.infoUrl}" class="map-btn" style="background:#9B8EC4" target="_blank">🔗 More</a>` : ''}
          </div>
        </div>
      </div>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${sample.name} — Flokk</title>
<link href="https://fonts.googleapis.com/css2?family=Pacifico&family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"/>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Inter',sans-serif;background:#FAF7F2;color:#1B2B4B;padding:0 0 32px;}
.cover{width:100%;background:linear-gradient(160deg,#111D33 0%,#1B2B4B 40%,${sample.color} 100%);padding:52px 24px 44px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:10px;margin-bottom:12px;}
.cover-emoji{width:72px;height:72px;border-radius:18px;background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;font-size:40px;margin-bottom:4px;}
.cover-title{font-family:'Pacifico',cursive;font-size:30px;color:#F5E882;line-height:1.3;}
.cover-desc{font-size:15px;color:rgba(255,255,255,0.75);line-height:1.6;max-width:340px;}
.cover-tags{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:4px;}
.tag-pill{font-size:12px;background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.25);border-radius:100px;padding:5px 14px;font-weight:500;}
.card{background:#fff;border-radius:20px;overflow:hidden;margin:0 12px 12px;box-shadow:0 2px 16px rgba(27,43,75,0.08);}
.card-header{padding:16px 20px 12px;background:#1B2B4B;display:flex;align-items:baseline;gap:8px;}
.card-label{font-family:'Pacifico',cursive;font-size:20px;color:#F5E882;}
.stops{padding:16px 20px;display:flex;flex-direction:column;}
.stop-row{display:flex;gap:14px;}
.stop-spine{display:flex;flex-direction:column;align-items:center;width:32px;flex-shrink:0;}
.stop-dot{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0;}
.stop-line{width:2px;flex:1;background:#EDE8E1;min-height:16px;margin-top:3px;}
.stop-body{flex:1;}
.stop-body-mb{padding-bottom:16px;}
.stop-title{font-size:15px;color:#1B2B4B;font-weight:600;line-height:1.4;}
.stop-place{font-size:13px;color:#6B7A90;margin-top:4px;}
.stop-notes{font-size:13px;color:#9BA8B5;margin-top:4px;font-style:italic;line-height:1.5;}
.stop-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;align-items:center;}
.chip{font-size:12px;background:#F0EBE3;color:#1B2B4B;border-radius:8px;padding:4px 10px;border:1px solid #EDE8E1;}
.chip-cost{color:#C85A2A;background:#FFF5F0;border-color:#FFD0B5;}
.map-btn{font-size:12px;background:#C85A2A;color:#fff;border:none;border-radius:10px;padding:6px 14px;text-decoration:none;font-weight:600;display:inline-block;} .info-btn{font-size:12px;background:#9B8EC4;color:#fff;border:none;border-radius:10px;padding:6px 14px;text-decoration:none;font-weight:600;display:inline-block;}
.flok-banner{margin:24px 12px 0;background:linear-gradient(135deg,#1B2B4B 0%,#C85A2A 100%);border-radius:20px;padding:32px 24px;text-align:center;}
.flok-banner h2{font-family:'Pacifico',cursive;font-size:22px;color:#F5E882;margin:10px 0 8px;}
.flok-banner p{font-size:14px;color:rgba(255,255,255,0.75);line-height:1.6;margin-bottom:20px;}
.flok-btn{display:inline-block;background:#F5E882;color:#1B2B4B;font-weight:800;font-size:15px;padding:14px 32px;border-radius:100px;text-decoration:none;}
.flok-url{font-size:11px;color:rgba(255,255,255,0.35);margin-top:14px;letter-spacing:0.5px;}
</style></head>
<body>
<div class="cover">
  <div class="cover-emoji">${sample.emoji}</div>
  <div class="cover-title">${sample.name}</div>
  <div class="cover-desc">${sample.description}</div>
  <div class="cover-tags">
    ${sample.tags.map(t => `<span class="tag-pill">${t}</span>`).join("")}
    <span class="tag-pill">${sample.ideas.length} stops</span>
  </div>
</div>
<div class="card">
  <div class="card-header">
    <div class="card-label">All Stops</div>
  </div>
  <div class="stops">${stopCards}</div>
</div>
<div class="flok-banner">
  <div style="font-size:36px">🦩</div>
  <h2>Made with Flokk</h2>
  <p>Plan your next trip with your whole crew.<br/>Free to use · No download needed · Works on any device.</p>
  <a href="https://trip-planner-nine-gray.vercel.app" class="flok-btn">🦩 Plan your own trip on Flokk →</a>
  <div class="flok-url">trip-planner-nine-gray.vercel.app</div>
</div>
</body></html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sample.name.replace(/[^a-z0-9]/gi,"_")}_by_Flokk.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

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
              ${item.infoUrl?.trim() ? `<a href="${item.infoUrl}" class="map-btn" style="background:#9B8EC4">🔗 More</a>` : ""}
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
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Inter',sans-serif;background:#FAF7F2;color:#1B2B4B;padding:0 0 32px;}

/* Cover */
.cover-card{width:100%;background:linear-gradient(160deg,#111D33 0%,#1B2B4B 40%,#233260 100%);overflow:hidden;margin-bottom:12px;}
.cover-inner{padding:52px 24px 44px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;}
.cover-plane{width:72px;height:72px;background:#C85A2A;border-radius:18px;display:flex;align-items:center;justify-content:center;font-size:40px;margin-bottom:4px;}
.cover-title{font-family:'Pacifico',cursive;font-size:32px;color:#F5E882;line-height:1.3;}
.cover-dates{font-size:15px;color:rgba(255,255,255,0.8);font-weight:500;}
.cover-meta{font-size:13px;color:rgba(255,255,255,0.5);}
.cover-travellers{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:4px;}
.traveller{font-size:13px;background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:20px;padding:6px 16px;font-weight:500;}
.legend{display:flex;flex-wrap:wrap;gap:8px 16px;justify-content:center;margin-top:16px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.15);}
.legend-item{font-size:12px;color:rgba(255,255,255,0.7);display:flex;align-items:center;gap:5px;}

/* Day cards — match app style */
.day-card{background:#fff;border-radius:20px;overflow:hidden;margin:0 12px 12px;box-shadow:0 2px 16px rgba(26,58,143,0.08);}
.day-header{padding:16px 20px 12px;background:#1B2B4B;display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:4px;}
.day-num{font-family:'Pacifico',cursive;font-size:24px;color:#F5E882;margin-right:8px;}
.day-date{font-size:13px;color:#C9B8A8;}
.day-trip{font-size:11px;color:rgba(168,196,224,0.7);}
.stay-banner{display:flex;align-items:center;gap:12px;background:#FAF7F2;border-bottom:1px solid #C9B8A8;padding:14px 20px;}
.stay-name{font-size:14px;color:#1B2B4B;font-weight:600;}
.stay-place{font-size:12px;color:#6B7A90;margin-top:2px;}
.stops{padding:16px 20px;display:flex;flex-direction:column;}
.stop-row{display:flex;gap:14px;}
.stop-spine{display:flex;flex-direction:column;align-items:center;width:32px;flex-shrink:0;}
.stop-dot{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0;z-index:1;}
.stop-line{width:2px;flex:1;background:#FAF7F2;min-height:16px;margin-top:3px;}
.stop-body{flex:1;}
.stop-body-mb{padding-bottom:16px;}
.stop-title{font-size:15px;color:#1B2B4B;font-weight:600;line-height:1.4;}
.stop-place{font-size:13px;color:#6B7A90;margin-top:4px;}
.stop-notes{font-size:13px;color:#78909c;margin-top:4px;font-style:italic;line-height:1.5;}
.stop-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;align-items:center;}
.chip{font-size:13px;background:#FAF7F2;color:#1B2B4B;border-radius:8px;padding:4px 10px;border:1px solid #FAF7F2;}
.chip-cost{color:#C85A2A;background:#fff5f0;border-color:#ffd0b5;}
.map-btn{font-size:13px;background:#C85A2A;color:#fff;border:none;border-radius:10px;padding:8px 16px;text-decoration:none;white-space:nowrap;display:inline-block;font-weight:600;} .info-btn{font-size:13px;background:#9B8EC4;color:#fff;border:none;border-radius:10px;padding:8px 16px;text-decoration:none;white-space:nowrap;display:inline-block;font-weight:600;}
.day-footer{padding:12px 20px;border-top:1px solid #FAF7F2;display:flex;justify-content:space-between;background:#fafcff;font-size:12px;color:#C9B8A8;}
</style></head>
<body>

${coverHtml}
${dayCards}

<!-- Made with Flokk footer -->
<div style="margin:24px 12px 0;background:linear-gradient(135deg,#1B2B4B 0%,#C85A2A 100%);border-radius:20px;padding:32px 24px;text-align:center;">
  <div style="font-size:36px;margin-bottom:10px">🦩</div>
  <div style="font-family:'Pacifico',cursive;font-size:24px;color:#F5E882;margin-bottom:8px">Made with Flokk</div>
  <div style="font-size:14px;color:rgba(255,255,255,0.75);margin-bottom:20px;line-height:1.7;font-family:'Inter',sans-serif;">
    Plan your next trip with your whole crew.<br/>
    Free to use · No download needed · Works on any device.
  </div>
  <a href="https://trip-planner-nine-gray.vercel.app"
    style="display:inline-block;background:#F5E882;color:#1B2B4B;font-family:'Inter',sans-serif;font-weight:800;font-size:15px;padding:14px 32px;border-radius:100px;text-decoration:none;letter-spacing:-0.3px;">
    🦩 Plan your own trip on Flokk →
  </a>
  <div style="font-size:11px;color:rgba(255,255,255,0.35);margin-top:16px;font-family:'Inter',sans-serif;letter-spacing:0.5px;">trip-planner-nine-gray.vercel.app</div>
</div>
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
        <div style={{ color: "#6B7A90", textAlign: "center", padding: "80px 0", fontSize: 14, fontFamily: "'Inter',sans-serif" }}>
          Schedule some ideas to see your journey map
        </div>
      </div>
    );
  }

  // Terrain textures per day index (cycles)
  const terrains = [
    { bg: "linear-gradient(180deg,#FAF7F2 0%,#c8e6f0 60%,#a8d4e8 100%)", road: "#fff", label: "coastal" },
    { bg: "linear-gradient(180deg,#e8f5e9 0%,#c8e6c9 60%,#a5d6a7 100%)", road: "#fff", label: "forest" },
    { bg: "linear-gradient(180deg,#fff8e1 0%,#ffecb3 60%,#ffe082 100%)", road: "#fff", label: "desert" },
    { bg: "linear-gradient(180deg,#fce4ec 0%,#f8bbd0 60%,#f48fb1 100%)", road: "#fff", label: "city" },
    { bg: "linear-gradient(180deg,#ede7f6 0%,#d1c4e9 60%,#b39ddb 100%)", road: "#fff", label: "mountain" },
  ];

  return (
    <div style={styles.storyOuter}>
      {/* Cover map card */}
      <div style={{ ...styles.mapCard, background: "linear-gradient(160deg,#1B2B4B 0%,#233260 50%,#C9B8A8 100%)" }}>
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
            <path d="M 10 20 Q 65 5 130 20 Q 195 35 250 20" stroke="#F5E882" strokeWidth="2" strokeDasharray="5,5" fill="none"/>
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
                        fontFamily: "'Inter',sans-serif",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                      }}>{i + 1}</div>
                    </div>
                    {/* Label pill */}
                    <div style={{
                      background: "rgba(255,255,255,0.92)",
                      borderRadius: 20,
                      padding: "2px 8px",
                      fontSize: 9,
                      color: "#1B2B4B",
                      fontFamily: "'Inter',sans-serif",
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
                        fontSize: 8, color: "#6B7A90",
                        fontFamily: "'Inter',sans-serif",
                        marginTop: 2,
                      }}>{item.time}</div>
                    )}
                    {/* Map link */}
                    {item.mapsUrl && (
                      <a href={item.mapsUrl} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 8, color: "#C85A2A", marginTop: 1, textDecoration: "none", fontFamily: "'Inter',sans-serif" }}
                        onClick={e => e.stopPropagation()}>
                        🗺 map
                      </a>
                    )}
                  </div>
                );
              })}

              {/* Empty state */}
              {allStops.length === 0 && (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "#6B7A90", fontSize: 12, fontFamily: "'Inter',sans-serif" }}>
                  No stops yet for this day
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={styles.mapDayFooter}>
              <span>{allStops.length} stop{allStops.length !== 1 ? "s" : ""}</span>
              {allStops.some(s => s.mapsUrl) && (
                <a href={buildDayRouteUrl(stops)}
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
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 20 }}>
            {trip.travellers.map(t => (
              <span key={t} style={styles.storyCoverTraveller}>{t}</span>
            ))}
          </div>
          {/* Category legend */}
          <div style={styles.storyCoverLegend}>
            {CATEGORIES.filter(c => c.id !== "misc").map(c => (
              <div key={c.id} style={styles.storyCoverLegendItem}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: c.color, flexShrink: 0, border: "1.5px solid rgba(255,255,255,0.3)" }} />
                {c.icon} {c.label}
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
                  <div style={{ fontSize: 11, color: "#1B2B4B", fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>{stay.title}</div>
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
                          <div style={{ fontSize: 13, color: "#1B2B4B", fontWeight: 500, lineHeight: 1.3, fontFamily: "'Inter',sans-serif" }}>
                            {cat.icon} {item.title}
                            {item.bookedStatus === "booked" && <span style={{ color: "#10b981", marginLeft: 6 }}>✅</span>}
                            {item.bookedStatus === "need-to-book" && <span style={{ color: "#f59e0b", marginLeft: 6, fontSize: 11 }}>📋</span>}
                          </div>
                          {item.place && <div style={{ fontSize: 11, color: "#6B7A90", marginTop: 2, fontFamily: "'Inter',sans-serif" }}>📍 {item.place}</div>}
                          {item.notes && <div style={{ fontSize: 11, color: "#6B7A90", marginTop: 2, fontStyle: "italic", lineHeight: 1.4, fontFamily: "'Inter',sans-serif" }}>{item.notes}</div>}
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                            {item.time && <span style={styles.storyChip}>{item.time}</span>}
                            {item.cost && <span style={{ ...styles.storyChip, color: "#f59e0b" }}>💰 {item.cost} {item.currency}</span>}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 4 }}>
                          {item.mapsUrl && (
                            <a href={item.mapsUrl} target="_blank" rel="noopener noreferrer" style={styles.storyMapBtn}>🗺 Map</a>
                          )}
                          {item.infoUrl?.trim() && (
                            <a href={item.infoUrl} target="_blank" rel="noopener noreferrer" style={{ ...styles.storyMapBtn, background: "#9B8EC4" }}>🔗 More</a>
                          )}
                        </div>
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
  const [screen, setScreen] = useState("dashboard"); // "dashboard" | "setup" | "app"
  const [currentTripId, setCurrentTripId] = useState(null);
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
  const [showMarketplace, setShowMarketplace] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState(null); // last known saved state
  const ghostRef = useRef(null);
  const touchRef = useRef(null);
  const stateRef = useRef({ ideas, trip });
  stateRef.current = { ideas, trip };

  // Force correct mobile viewport scaling
  useEffect(() => {
    let meta = document.querySelector("meta[name=viewport]");
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "viewport";
      document.head.appendChild(meta);
    }
    meta.content = "width=device-width, initial-scale=1, maximum-scale=1";
  }, []);

  // Show welcome message if arriving from a shared Flokk itinerary
  const [showWelcomeBanner, setShowWelcomeBanner] = useState(() => {
    try {
      const ref = document.referrer || "";
      const isSharedLink = ref === "" && !localStorage.getItem("flok-returning-user");
      return isSharedLink;
    } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("flok-returning-user", "1"); } catch {}
  }, []);

  // Storage
  useEffect(() => {
    async function load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const s = JSON.parse(raw);
          if (s.trip) {
            // Migrate: assign ID if missing, save under per-trip key
            const migratedTrip = s.trip.id ? s.trip : { ...s.trip, id: 'trip-' + Date.now() };
            if (!s.trip.id) {
              try {
                localStorage.setItem('trip-' + migratedTrip.id, JSON.stringify({ trip: migratedTrip, ideas: s.ideas || [] }));
                localStorage.setItem(STORAGE_KEY, JSON.stringify({ trip: migratedTrip, ideas: s.ideas || [] }));
              } catch {}
            }
            setTrip(migratedTrip);
            setCurrentTripId(migratedTrip.id);
            setActiveDay(migratedTrip.dates?.[0] || null);
            setSavedSnapshot({ ...s, trip: migratedTrip });
            // Always start on dashboard — don't auto-open into a trip
          }
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
        const tripKey = trip?.id ? `trip-${trip.id}` : STORAGE_KEY;
        localStorage.setItem(tripKey, JSON.stringify({ trip, ideas }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ trip, ideas }));
        if (trip) saveToIndex(trip, ideas);
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

  const saveToIndex = (t, i) => {
    try {
      const raw = localStorage.getItem(TRIPS_INDEX_KEY);
      const index = raw ? JSON.parse(raw) : [];
      const entry = {
        id: t.id || "default",
        name: t.name, start: t.start, end: t.end,
        travellers: t.travellers,
        ideaCount: i.filter(x => x.date).length,
        tripData: t,
        ideasData: i,
      };
      const exists = index.findIndex(x => x.id === entry.id);
      if (exists > -1) index[exists] = entry;
      else index.unshift(entry);
      localStorage.setItem(TRIPS_INDEX_KEY, JSON.stringify(index));
    } catch {}
  };


  const manualSave = async () => {
    setSaveStatus("saving");
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ trip, ideas }));
      if (trip) saveToIndex(trip, ideas);
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
  Object.values(scheduled).forEach(arr => arr.sort((a,b) => {
    // Items with no time keep their current order (drag-reordered)
    if (!a.time && !b.time) return 0;
    if (!a.time) return 1;  // no time goes to end
    if (!b.time) return -1; // no time goes to end
    return a.time > b.time ? 1 : -1; // earliest time first
  }));

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
      if (dragOver === "pool") {
        setIdeas(prev => prev.map(i => i.id === dragging.id ? { ...i, date: "", time: "" } : i));
      } else if (dragOver.startsWith("slot-")) {
        // Reorder within day
        const parts = dragOver.split("-"); // slot-YYYY-MM-DD-idx or slot-YYYY-MM-DD-end
        const isEnd = dragOver.endsWith("-end");
        const dayDate = parts.slice(1, isEnd ? -1 : -1).join("-");
        const toIndex = isEnd
          ? (scheduled[dayDate]?.length || 0)
          : parseInt(parts[parts.length - 1]);
        if (dragging.date === dayDate) {
          reorderInDay(dragging.id, dayDate, toIndex);
        } else {
          setIdeas(prev => prev.map(i => i.id === dragging.id ? { ...i, date: dayDate } : i));
        }
      } else {
        setIdeas(prev => prev.map(i => i.id === dragging.id ? { ...i, date: dragOver } : i));
      }
    }
    setDragging(null); setDragOver(null); touchRef.current = null;
  };

  // Reorder within a day by moving idea to a specific index
  const reorderInDay = (ideaId, dayDate, toIndex) => {
    setIdeas(prev => {
      const dayIdeas = prev.filter(i => i.date === dayDate && i.category !== "accommodation")
        .sort((a,b) => {
          if (!a.time && !b.time) return 0;
          if (!a.time) return 1;
          if (!b.time) return -1;
          return a.time > b.time ? 1 : -1;
        });
      const others = prev.filter(i => i.date !== dayDate || i.category === "accommodation");
      const fromIndex = dayIdeas.findIndex(i => i.id === ideaId);
      if (fromIndex === -1 || fromIndex === toIndex) return prev;
      const reordered = [...dayIdeas];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);
      // Assign synthetic times to preserve order (00:00, 00:01 etc as order markers)
      // Actually just keep ideas in order — we track order by array position
      return [...others, ...reordered];
    });
  };

  const dragProps = (idea) => ({
    draggable: true,
    onDragStart: e => startDrag(e, idea),
    onDragEnd: () => { setDragging(null); setDragOver(null); },
    onTouchStart: e => onTouchStart(e, idea),
    onTouchMove,
    onTouchEnd,
  });

  // Responsive width tracking — updates on resize
  const [windowWidth, setWindowWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 375);
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  const isMobile = windowWidth < 1024;

  if (!loaded) return <div style={{ background: "#FAF7F2", height: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7A90", fontFamily: "'Inter',sans-serif" }}>Loading...</div>;

  if (screen === "dashboard") return (
    <>
      <TripDashboard
        onSample={() => setShowMarketplace(true)}
        onSelect={(id) => {
          try {
            // Try trips index first (stores full data)
            const indexRaw = localStorage.getItem(TRIPS_INDEX_KEY);
            if (indexRaw) {
              const index = JSON.parse(indexRaw);
              const entry = index.find(x => x.id === id);
              if (entry?.tripData) {
                setTrip(entry.tripData);
                setIdeas(entry.ideasData || []);
                setActiveDay(entry.tripData.dates?.[0] || null);
                setTab('plan');
                setScreen('app'); return;
              }
            }
            // Scan all localStorage keys as fallback
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              try {
                const val = JSON.parse(localStorage.getItem(key));
                if (val?.trip?.id === id) {
                  setTrip(val.trip); setIdeas(val.ideas || []);
                  setActiveDay(val.trip.dates?.[0] || null);
                  setTab('plan'); setScreen('app'); return;
                }
              } catch {}
            }
          } catch {}
          setScreen('app');
        }}
        onNew={() => { setTrip(null); setIdeas([]); setScreen("setup"); }}
      />
      {showMarketplace && (
        <TripMarketplace
          onClose={() => setShowMarketplace(false)}
          onLoadTrip={(newTrip, newIdeas) => {
            const today = new Date().toISOString().slice(0, 10);
            const endDate = new Date(Date.now() + 6*24*60*60*1000).toISOString().slice(0, 10);
            const dates = [];
            for (let d = new Date(today); d <= new Date(endDate); d.setDate(d.getDate()+1)) {
              dates.push(d.toISOString().slice(0,10));
            }
            const tripWithDates = { ...newTrip, id: 'trip-' + Date.now(), start: today, end: endDate, dates };
            setTrip(tripWithDates);
            setIdeas(newIdeas);
            setActiveDay(today);
            setShowMarketplace(false);
            setScreen("app");
          }}
        />
      )}
    </>
  );

  if (screen === "setup") return <TripSetup
    onDone={(t) => {
      const dates = dateRange(t.start, t.end);
      const tripObj = { ...t, id: uid(), dates };
      setTrip(tripObj);
      setIdeas([]);
      setActiveDay(dates[0]);
      // Save to trips index
      try {
        const raw = localStorage.getItem("tripplanner-trips-index");
        const existing = raw ? JSON.parse(raw) : [];
        const updated = [{ id: tripObj.id, name: tripObj.name, start: tripObj.start, end: tripObj.end, travellers: tripObj.travellers, ideaCount: 0 }, ...existing.filter(t => t.id !== tripObj.id)];
        localStorage.setItem("tripplanner-trips-index", JSON.stringify(updated));
        localStorage.setItem(`trip-${tripObj.id}`, JSON.stringify({ trip: tripObj, ideas: [] }));
      } catch {}
      setScreen("app");
    }}
    savedTrip={null}
    onResume={null}
  />;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Pacifico&family=Inter:wght@300;400;500;600;700;800&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        html,body{height:100%;overflow:hidden;background:#FAF7F2;font-family:'Inter',sans-serif;color:#1B2B4B;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;}
        ::-webkit-scrollbar{width:3px;height:3px;} ::-webkit-scrollbar-track{background:transparent;} ::-webkit-scrollbar-thumb{background:#C9B8A8;border-radius:4px;}
        input,select,textarea{color-scheme:light;font-family:'Inter',sans-serif;}
        a{color:inherit;}
        button{-webkit-tap-highlight-color:transparent;}
        /* Sidebar/panel -- toggled by bottom nav on mobile */
        .sidebar{display:none!important;}
        .sidebar.show{display:flex!important;}
        .main-panel{display:none!important;}
        .main-panel.show{display:flex!important;}
        /* Bottom nav always visible */
        .mobile-nav{display:flex!important;}
        /* Top tab bar hidden -- bottom nav handles it */
        .tab-row-bar{display:none!important;}
        `}</style>

      {/* Forms */}
      {(showForm || editIdea) && (
        <IdeaForm idea={editIdea} tripDates={tripDates} travellers={trip.travellers}
          onSave={saveIdea}
          onCancel={() => { setShowForm(false); setEditIdea(null); }} />
      )}

      {/* Welcome banner for new visitors */}
      {showWelcomeBanner && screen === "dashboard" && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200, padding: "0 16px 24px" }}>
          <div style={{ background: "linear-gradient(135deg,#1B2B4B,#C85A2A)", borderRadius: 20, padding: "20px 20px 16px", boxShadow: "0 -8px 40px rgba(27,43,75,0.3)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <span style={{ fontSize: 32, flexShrink: 0 }}>🦩</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: 16, color: "#F5E882", marginBottom: 4 }}>
                  Welcome to Flokk!
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", lineHeight: 1.5, marginBottom: 12 }}>
                  Someone shared a trip with you. Plan your own — free, no account needed.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={{ ...styles.btnPrimary, background: "#F5E882", color: "#1B2B4B", fontSize: 13, padding: "10px 18px" }}
                    onClick={() => { setShowWelcomeBanner(false); }}>
                    Start planning →
                  </button>
                  <button style={{ background: "rgba(255,255,255,0.15)", color: "white", border: "none", borderRadius: 12, padding: "10px 14px", fontSize: 13, cursor: "pointer" }}
                    onClick={() => setShowWelcomeBanner(false)}>
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
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
                setConfirmNew(false);
                setScreen("dashboard");
              }}>Yes, start fresh</button>
            </div>
          </div>
        </div>
      )}

      {/* Sample Trips Marketplace */}
      {showMarketplace && (
        <TripMarketplace
          onClose={() => setShowMarketplace(false)}
          onLoadTrip={(newTrip, newIdeas) => {
            // Give it proper dates spanning next 7 days as placeholder
            const today = new Date().toISOString().slice(0, 10);
            const end = new Date(Date.now() + 6*24*60*60*1000).toISOString().slice(0, 10);
            const dates = [];
            for (let d = new Date(today); d <= new Date(end); d.setDate(d.getDate()+1)) {
              dates.push(d.toISOString().slice(0,10));
            }
            const tripWithDates = { ...newTrip, id: newTrip.id || ('trip-' + Date.now()), start: today, end, dates };
            setTrip(tripWithDates);
            setIdeas(newIdeas);
            setActiveDay(today);
            setShowMarketplace(false);
            setScreen("app");
          }}
        />
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
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>Start date</label>
                  <input style={{ ...styles.input, marginTop: 6 }} type="date" value={trip.start}
                    onChange={e => {
                      const newStart = e.target.value;
                      if (newStart && trip.end && newStart <= trip.end) {
                        const newDates = dateRange(newStart, trip.end);
                        setTrip(t => ({ ...t, start: newStart, dates: newDates }));
                      } else {
                        setTrip(t => ({ ...t, start: newStart }));
                      }
                    }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>End date</label>
                  <input style={{ ...styles.input, marginTop: 6 }} type="date" value={trip.end}
                    onChange={e => {
                      const newEnd = e.target.value;
                      if (trip.start && newEnd && trip.start <= newEnd) {
                        const newDates = dateRange(trip.start, newEnd);
                        setTrip(t => ({ ...t, end: newEnd, dates: newDates }));
                      } else {
                        setTrip(t => ({ ...t, end: newEnd }));
                      }
                    }} />
                </div>
              </div>
              {trip.start && trip.end && trip.start <= trip.end && (
                <div style={{ fontSize: 12, color: "#6B7A90", fontFamily: "'Inter',sans-serif", marginTop: -8 }}>
                  {dateRange(trip.start, trip.end).length} days · {fmtDate(trip.start)} – {fmtDate(trip.end)}
                  {ideas.filter(i => i.date && !dateRange(trip.start, trip.end).includes(i.date)).length > 0 && (
                    <span style={{ color: "#C85A2A", marginLeft: 8 }}>
                      ⚠ {ideas.filter(i => i.date && !dateRange(trip.start, trip.end).includes(i.date)).length} ideas fall outside new dates
                    </span>
                  )}
                </div>
              )}
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
                        style={{ background: "none", border: "none", color: "#C85A2A", cursor: "pointer", marginLeft: 4 }}>✕</button>
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
            <button onClick={() => { manualSave(); setScreen("dashboard"); }}
              style={{ ...styles.logo, cursor: "pointer", border: "none" }}
              title="Back to all trips">✈</button>
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
        <div className="tab-row-bar" style={styles.tabRowBar}>
          {[["plan","📋","Plan"],["budget","💰","Budget"],["story","📱","Share"]].map(([id,icon,label]) => (
            <button key={id} style={{ ...styles.tabRowBtn, ...(tab === id ? styles.tabRowBtnActive : {}) }}
              onClick={() => { setTab(id); if(id==="plan") setMobileView("pool"); }}>
              <span>{icon}</span><span>{label}</span>
            </button>
          ))}
          <button style={{ ...styles.tabRowBtn, fontSize: 11, color: "#C9B8A8" }} onClick={() => setScreen("dashboard")}>🏠 Home</button>
        </div>

        {/* Main content area */}
        {tab === "plan" && (
          <div style={styles.planLayout}>
            {/* Ideas Pool */}
            <div style={{ ...styles.poolPanel, ...(dragOver === "pool" ? { borderColor: "#f59e0b", background: "#1a1500" } : {}), display: isMobile ? (mobileView === "pool" ? "flex" : "none") : "flex" }}
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
            <div style={{ ...styles.schedulePanel, display: isMobile ? (mobileView === "schedule" ? "flex" : "none") : "flex" }}>
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
                  {activeDay && scheduled[activeDay]?.length > 0 && (() => {
                      const url = buildDayRouteUrl(scheduled[activeDay] || []);
                      return url ? <a href={url} target="_blank" rel="noopener noreferrer" style={styles.mapsBtn}>🗺 Day Route</a> : null;
                    })()}
                </div>

                <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 0 }}>
                  {/* Stay banners */}
                  {activeDay && (staysOnDay[activeDay] || []).map(stay => (
                    <div key={stay.id} style={styles.stayBanner}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 20 }}>🏨</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "#1B2B4B", fontFamily: "'Inter',sans-serif" }}>{stay.title}</div>
                          <div style={{ fontSize: 11, color: "#6B7A90", marginTop: 2, fontFamily: "'Inter',sans-serif" }}>
                            {fmtDate(stay.date)}{stay.checkOut && stay.checkOut !== stay.date ? ` → ${fmtDate(stay.checkOut)}` : ""}
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

                  {/* Timeline with drop slots for reordering */}
                  {activeDay && (scheduled[activeDay] || []).length > 0 && (
                    <>
                      {(scheduled[activeDay] || []).map((idea, idx) => {
                        const dropSlotId = `slot-${activeDay}-${idx}`;
                        const isOverSlot = dragOver === dropSlotId;
                        return (
                          <div key={idea.id}>
                            {/* Drop slot BEFORE each item */}
                            <div
                              data-dropzone={dropSlotId}
                              onDragOver={e => { e.preventDefault(); setDragOver(dropSlotId); }}
                              onDragLeave={() => setDragOver(null)}
                              onDrop={e => {
                                e.preventDefault();
                                if (dragging && dragging.date === activeDay) {
                                  reorderInDay(dragging.id, activeDay, idx);
                                } else if (dragging) {
                                  setIdeas(prev => prev.map(i => i.id === dragging.id ? { ...i, date: activeDay } : i));
                                }
                                setDragging(null); setDragOver(null);
                              }}
                              style={{
                                height: isOverSlot ? 44 : 6,
                                margin: "2px 0",
                                borderRadius: 8,
                                background: isOverSlot ? "#C85A2A18" : "transparent",
                                border: isOverSlot ? "2px dashed #C85A2A" : "2px solid transparent",
                                transition: "all .15s",
                                display: "flex", alignItems: "center", justifyContent: "center",
                              }}>
                              {isOverSlot && <span style={{ fontSize: 11, color: "#C85A2A", fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>Drop here</span>}
                            </div>
                            {/* The card itself */}
                            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                              <div style={styles.tlLine}>
                                <div style={{ ...styles.tlDot, background: CAT[idea.category]?.color || "#555" }} />
                                {idx < (scheduled[activeDay].length - 1) && <div style={styles.tlConnector} />}
                              </div>
                              <div style={{ flex: 1, marginBottom: 4 }}>
                                <IdeaCard idea={idea} compact
                                  onEdit={i => setEditIdea(i)}
                                  onDelete={deleteIdea}
                                  {...dragProps(idea)} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {/* Drop slot at END */}
                      {(() => {
                        const endSlotId = `slot-${activeDay}-end`;
                        const isOverEnd = dragOver === endSlotId;
                        return (
                          <div
                            data-dropzone={endSlotId}
                            onDragOver={e => { e.preventDefault(); setDragOver(endSlotId); }}
                            onDragLeave={() => setDragOver(null)}
                            onDrop={e => {
                              e.preventDefault();
                              if (dragging && dragging.date === activeDay) {
                                reorderInDay(dragging.id, activeDay, (scheduled[activeDay] || []).length);
                              } else if (dragging) {
                                setIdeas(prev => prev.map(i => i.id === dragging.id ? { ...i, date: activeDay } : i));
                              }
                              setDragging(null); setDragOver(null);
                            }}
                            style={{
                              height: isOverEnd ? 44 : 12,
                              borderRadius: 8,
                              background: isOverEnd ? "#C85A2A18" : "transparent",
                              border: isOverEnd ? "2px dashed #C85A2A" : "2px solid transparent",
                              transition: "all .15s",
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                            {isOverEnd && <span style={{ fontSize: 11, color: "#C85A2A", fontWeight: 600 }}>Drop here</span>}
                          </div>
                        );
                      })()}
                    </>
                  )}

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
            <div style={{ padding: "10px 16px", borderBottom: "1px solid #C9B8A8", background: "#F0EBE3", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, gap: 10, flexWrap: "wrap" }}>
              {/* View toggle */}
              <div style={{ display: "flex", background: "#C9B8A8", borderRadius: 8, padding: 3, gap: 2 }}>
                <button onClick={() => setStoryMode("cards")}
                  style={{ padding: "5px 12px", borderRadius: 6, border: "none", fontFamily: "'Inter',sans-serif", fontSize: 11, cursor: "pointer", background: storyMode === "cards" ? "#fff" : "transparent", color: storyMode === "cards" ? "#1B2B4B" : "#6B7A90", fontWeight: storyMode === "cards" ? 700 : 400, transition: "all .2s" }}>
                  📋 Cards
                </button>
                <button onClick={() => setStoryMode("map")}
                  style={{ padding: "5px 12px", borderRadius: 6, border: "none", fontFamily: "'Inter',sans-serif", fontSize: 11, cursor: "pointer", background: storyMode === "map" ? "#fff" : "transparent", color: storyMode === "map" ? "#1B2B4B" : "#6B7A90", fontWeight: storyMode === "map" ? 700 : 400, transition: "all .2s" }}>
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

        {/* Mobile bottom nav — all 4 tabs */}
        <div style={{ ...styles.mobileNav, display: isMobile ? "flex" : "none" }}>
          <button style={{ ...styles.mnavBtn, ...(tab==="plan" && mobileView==="pool" ? styles.mnavActive : {}) }}
            onClick={() => { setTab("plan"); setMobileView("pool"); }}>
            <span style={{ fontSize: 22 }}>💡</span>
            <span>Ideas</span>
          </button>
          <button style={{ ...styles.mnavBtn, ...(tab==="plan" && mobileView==="schedule" ? styles.mnavActive : {}) }}
            onClick={() => { setTab("plan"); setMobileView("schedule"); }}>
            <span style={{ fontSize: 22 }}>🗓</span>
            <span>Plan</span>
          </button>
          <button style={{ ...styles.mnavBtn, ...(tab==="budget" ? styles.mnavActive : {}) }}
            onClick={() => setTab("budget")}>
            <span style={{ fontSize: 22 }}>💰</span>
            <span>Budget</span>
          </button>
          <button style={{ ...styles.mnavBtn, ...(tab==="story" ? styles.mnavActive : {}) }}
            onClick={() => setTab("story")}>
            <span style={{ fontSize: 22 }}>📱</span>
            <span>Share</span>
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  app: { height: "100dvh", display: "flex", flexDirection: "column", background: "#FAF7F2", overflow: "hidden" },
  topbar: { background: "#1B2B4B", padding: "10px 16px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 },
  tabRowBar: { background: "#111D33", display: "flex", borderBottom: "1px solid #233260", flexShrink: 0 },
  tabRowBtn: { flex: 1, padding: "10px 4px", border: "none", background: "none", color: "#C9B8A8", fontSize: 11, fontFamily: "'Inter',sans-serif", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, transition: "all .2s", borderBottom: "2px solid transparent" },
  tabRowBtnActive: { color: "#F5E882", borderBottomColor: "#C85A2A" },
  iconAction: { background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 10, width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff", transition: "background .2s" },
  logo: { fontSize: 24, background: "#C85A2A", borderRadius: 8, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  tripName: { fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 15, color: "#F5E882" },
  tripMeta: { fontSize: 10, color: "#C9B8A8", marginTop: 1, fontFamily: "'Inter',sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  tabBar: { display: "flex", background: "#111D33", borderRadius: 10, padding: 3, gap: 2 },
  tabBtn: { padding: "6px 10px", borderRadius: 8, border: "none", background: "none", color: "#C9B8A8", fontSize: 10, cursor: "pointer", fontFamily: "'Inter',sans-serif", whiteSpace: "nowrap" },
  tabBtnActive: { background: "#C85A2A", color: "#fff", fontWeight: 700 },
  btnPrimary: { background: "#C85A2A", color: "#fff", border: "none", borderRadius: 12, padding: "12px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Inter',sans-serif", whiteSpace: "nowrap" },
  btnSecondary: { background: "#FAF7F2", color: "#1B2B4B", border: "1px solid #C9B8A8", borderRadius: 12, padding: "12px 18px", fontSize: 13, cursor: "pointer", fontFamily: "'Inter',sans-serif", whiteSpace: "nowrap" },

  planLayout: { flex: 1, display: "flex", overflow: "hidden" },
  poolPanel: { width: "min(320px, 100%)", flexShrink: 0, background: "#F0EBE3", borderRight: "1px solid #C9B8A8", display: "flex", flexDirection: "column", padding: 16, overflow: "hidden", transition: "all .2s" },
  schedulePanel: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  panelHead: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 },
  panelTitle: { fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: 14, color: "#1B2B4B", letterSpacing: "-0.3px" },
  panelHint: { fontSize: 11, color: "#6B7A90", marginBottom: 12, lineHeight: 1.6, fontFamily: "'Inter',sans-serif" },
  countBadge: { background: "#1B2B4B", color: "#F5E882", borderRadius: 20, padding: "1px 8px", fontSize: 11, fontWeight: 600 },
  emptyState: { textAlign: "center", color: "#6B7A90", padding: "40px 0", fontSize: 13, fontFamily: "'Inter',sans-serif" },

  dayTabs: { display: "flex", borderBottom: "1px solid #C9B8A8", background: "#F0EBE3", overflowX: "auto", flexShrink: 0, scrollbarWidth: "none" },
  dayTab: { padding: "11px 16px", border: "none", background: "none", color: "#6B7A90", fontSize: 12, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap", borderBottom: "2px solid transparent", fontFamily: "'Inter',sans-serif", display: "flex", alignItems: "center", gap: 6, transition: "all .2s" },
  dayTabActive: { color: "#1B2B4B", borderBottomColor: "#C85A2A", fontWeight: 700 },
  dayCount: { background: "#C85A2A22", color: "#C85A2A", borderRadius: 10, padding: "1px 6px", fontSize: 10, fontWeight: 600 },
  dayContent: { flex: 1, display: "flex", flexDirection: "column", padding: 16, overflow: "hidden", transition: "all .2s", borderRadius: 0, outline: "2px solid transparent", background: "#FAF7F2" },
  dayTitle: { fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: 22, color: "#1B2B4B", letterSpacing: "-0.5px" },

  tlLine: { display: "flex", flexDirection: "column", alignItems: "center", width: 20, flexShrink: 0 },
  tlDot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0, marginTop: 16, border: "2px solid #FAF7F2" },
  tlConnector: { width: 2, flex: 1, background: "#C9B8A8", minHeight: 12 },

  dropHint: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#6B7A90", fontSize: 13, textAlign: "center", border: "2px dashed #C9B8A8", borderRadius: 16, margin: 8, padding: 32, fontFamily: "'Inter',sans-serif" },

  ideaCard: { background: "#fff", border: "1px solid #EDE8E1", borderLeft: "3px solid #555", borderRadius: 16, padding: "12px 12px 12px 4px", cursor: "default", transition: "all .2s", boxShadow: "0 1px 6px rgba(27,43,75,0.06)", userSelect: "none", WebkitUserSelect: "none" },
  ideaTitle: { fontSize: 14, color: "#1B2B4B", fontWeight: 600, lineHeight: 1.4, fontFamily: "'Inter',sans-serif", letterSpacing: "-0.2px" },
  ideaMeta: { fontSize: 12, color: "#6B7A90", marginTop: 4, lineHeight: 1.5, fontFamily: "'Inter',sans-serif" },
  tag: { fontSize: 11, background: "#F0EBE3", color: "#1B2B4B", borderRadius: 8, padding: "3px 8px", fontWeight: 500 },
  mapsTag: { fontSize: 11, background: "#C85A2A18", color: "#C85A2A", borderRadius: 8, padding: "3px 8px", textDecoration: "none", fontWeight: 600 },
  mapsBtn: { background: "#fff", color: "#C85A2A", border: "1.5px solid #C85A2A", borderRadius: 8, padding: "6px 12px", fontSize: 11, textDecoration: "none", whiteSpace: "nowrap", fontFamily: "'Inter',sans-serif", fontWeight: 600 },
  bookedBadge: { fontSize: 11, background: "#10b98115", color: "#059669", borderRadius: 8, padding: "2px 8px", fontWeight: 600 },
  iconBtn: { background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: "2px 4px", opacity: 0.5, transition: "opacity .2s", lineHeight: 1 },

  // Budget
  budgetWrap: { flex: 1, overflow: "auto", padding: 20, background: "#FAF7F2" },
  budgetSummary: { display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" },
  budgetStat: { background: "#fff", border: "1px solid #EDE8E1", borderRadius: 16, padding: "20px 24px", flex: 1, minWidth: 140 },
  budgetNum: { fontFamily: "'Inter',sans-serif", fontSize: 28, fontWeight: 800, color: "#C85A2A", letterSpacing: "-1px" },
  budgetLabel: { fontSize: 11, color: "#6B7A90", marginTop: 4, fontFamily: "'Inter',sans-serif", fontWeight: 500 },
  budgetDayLabel: { fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 11, color: "#1B2B4B", marginBottom: 8, textTransform: "uppercase", letterSpacing: "1.5px" },
  budgetTable: { width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 16, overflow: "hidden", marginBottom: 8, border: "1px solid #EDE8E1" },
  th: { padding: "10px 14px", fontSize: 11, color: "#6B7A90", textAlign: "left", fontWeight: 600, fontFamily: "'Inter',sans-serif", letterSpacing: "0.5px" },
  td: { padding: "12px 14px", fontSize: 13, color: "#1B2B4B", verticalAlign: "middle", fontFamily: "'Inter',sans-serif", fontWeight: 400, lineHeight: 1.5 },

  // Journey Map styles
  mapCard: { width: "min(100%, 380px)", borderRadius: 20, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 12px 32px rgba(27,43,75,.12)", flexShrink: 0, border: "1px solid rgba(255,255,255,0.4)" },
  mapCoverInner: { padding: "32px 24px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" },
  mapCoverTitle: { fontFamily: "'Pacifico',cursive", fontSize: 26, color: "#F5E882", marginBottom: 6, lineHeight: 1.3 },
  mapCoverDates: { fontFamily: "'Inter',sans-serif", fontSize: 12, color: "#C9B8A8", marginBottom: 4, fontWeight: 500 },
  mapCoverStats: { display: "flex", alignItems: "center", gap: 12, marginTop: 16, background: "rgba(255,255,255,0.1)", borderRadius: 12, padding: "10px 20px" },
  mapStat: { textAlign: "center", fontFamily: "'Inter',sans-serif", fontSize: 10, color: "#C9B8A8", lineHeight: 1.8 },
  mapStatNum: { display: "block", fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: 22, color: "#F5E882", lineHeight: 1 },
  mapStatDivider: { color: "#C9B8A8", fontSize: 18, opacity: 0.4 },
  mapDayHeader: { padding: "12px 16px 8px", background: "rgba(255,255,255,0.85)", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", alignItems: "baseline", gap: 8, backdropFilter: "blur(8px)" },
  mapDayNum: { fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: 18, color: "#1B2B4B" },
  mapDayDate: { fontFamily: "'Inter',sans-serif", fontSize: 11, color: "#6B7A90", flex: 1 },
  mapDayTrip: { fontFamily: "'Inter',sans-serif", fontSize: 10, color: "#C9B8A8" },
  mapDayFooter: { padding: "10px 16px", background: "rgba(255,255,255,0.85)", borderTop: "1px solid rgba(0,0,0,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "'Inter',sans-serif", fontSize: 11, color: "#6B7A90" },

  // Story — vertical per-day 9:16 cards
  storyOuter: { flex: 1, overflow: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 20 },
  storyCoverCard: { width: "min(100%, 380px)", aspectRatio: "9/16", background: "linear-gradient(160deg, #111D33 0%, #1B2B4B 40%, #2C3E6B 100%)", border: "none", borderRadius: 24, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(10,20,50,.5)", flexShrink: 0 },
  storyCoverInner: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", padding: "40px 28px 28px", textAlign: "center", gap: 0 },
  storyCoverEmoji: { fontSize: 48, marginBottom: 12, background: "#C85A2A", borderRadius: 16, width: 72, height: 72, display: "flex", alignItems: "center", justifyContent: "center" },
  storyCoverTitle: { fontFamily: "'Pacifico',cursive", fontWeight: 400, fontSize: 26, color: "#F5E882", lineHeight: 1.4, marginBottom: 8 },
  storyCoverDates: { fontSize: 13, color: "rgba(255,255,255,0.8)", marginBottom: 4, fontFamily: "'Inter',sans-serif", fontWeight: 500 },
  storyCoverMeta: { fontSize: 12, color: "rgba(255,255,255,0.5)", fontFamily: "'Inter',sans-serif", marginTop: 4 },
  storyCoverTraveller: { fontSize: 12, background: "rgba(255,255,255,0.12)", color: "#fff", borderRadius: 20, padding: "6px 14px", border: "1px solid rgba(255,255,255,0.2)", fontFamily: "'Inter',sans-serif", fontWeight: 500 },
  storyCoverLegend: { display: "flex", flexWrap: "wrap", gap: "8px 14px", justifyContent: "center", marginTop: "auto", padding: "16px 8px", borderTop: "1px solid rgba(255,255,255,.1)" },
  storyCoverLegendItem: { display: "flex", alignItems: "center", gap: 5, fontFamily: "'Inter',sans-serif", fontSize: 11, color: "rgba(255,255,255,0.7)", fontWeight: 500 },
  storyDayCard: { width: "min(100%, 380px)", background: "#fff", border: "1px solid #EDE8E1", borderRadius: 20, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 4px 24px rgba(27,43,75,.08)", flexShrink: 0 },
  storyDayCardHeader: { padding: "16px 20px 12px", background: "#1B2B4B", borderBottom: "1px solid #111D33", display: "flex", alignItems: "baseline", justifyContent: "space-between" },
  storyDayNum: { fontFamily: "'Pacifico',cursive", fontWeight: 400, fontSize: 22, color: "#F5E882" },
  storyDayCardDate: { fontSize: 12, color: "rgba(255,255,255,0.6)", fontFamily: "'Inter',sans-serif", fontWeight: 400 },
  storyDayCardTrip: { fontSize: 10, color: "rgba(255,255,255,0.4)", textAlign: "right", fontFamily: "'Inter',sans-serif" },
  storyDayStayBanner: { display: "flex", alignItems: "center", gap: 10, background: "#F5F0FF", borderBottom: "1px solid #E8E0FF", padding: "12px 20px" },
  storyDayStops: { flex: 1, padding: "16px 20px", display: "flex", flexDirection: "column", background: "#fff" },
  storyDayCardFooter: { padding: "10px 20px", borderTop: "1px solid #F0EBE3", display: "flex", justifyContent: "space-between", background: "#FDFAF7" },
  storyMapBtn: { background: "#C85A2A", color: "#fff", border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 11, textDecoration: "none", flexShrink: 0, whiteSpace: "nowrap", fontFamily: "'Inter',sans-serif", fontWeight: 600 },
  storyChip: { fontSize: 11, background: "#F0EBE3", color: "#1B2B4B", borderRadius: 6, padding: "3px 8px", fontFamily: "'Inter',sans-serif", fontWeight: 500 },
  storyLink: { fontSize: 10, color: "#C85A2A", textDecoration: "none", marginLeft: 4, fontWeight: 600 },
  storyTraveller: { fontSize: 10, background: "#C85A2A18", color: "#C85A2A", borderRadius: 10, padding: "2px 8px", fontWeight: 600 },

  // Forms
  overlay: { position: "fixed", inset: 0, background: "rgba(27,43,75,.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(6px)" },
  modal: { background: "#fff", border: "1px solid #EDE8E1", borderRadius: 24, width: "min(calc(100vw - 24px), 540px)", maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 80px rgba(27,43,75,.2)" },
  modalHeader: { display: "flex", alignItems: "center", gap: 10, padding: "18px 20px", borderBottom: "1px solid #EDE8E1", flexShrink: 0, background: "#1B2B4B" },
  modalTitle: { fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 17, color: "#F5E882", flex: 1, letterSpacing: "-0.3px" },
  closeBtn: { background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 18, lineHeight: 1 },
  formGrid: { flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 14, background: "#fff" },
  formFull: { display: "flex", flexDirection: "column", gap: 6 },
  formHalf: { display: "flex", flexDirection: "column", gap: 6, flex: 1 },
  modalFooter: { display: "flex", alignItems: "center", padding: "14px 20px", borderTop: "1px solid #EDE8E1", gap: 8, flexShrink: 0, background: "#FDFAF7" },
  label: { fontSize: 11, color: "#6B7A90", textTransform: "uppercase", letterSpacing: "0.8px", fontWeight: 600, fontFamily: "'Inter',sans-serif" },
  input: { background: "#FAF7F2", border: "1.5px solid #EDE8E1", borderRadius: 12, padding: "13px 14px", fontSize: 15, color: "#1B2B4B", fontFamily: "'Inter',sans-serif", outline: "none", width: "100%", transition: "border-color .2s", WebkitAppearance: "none", fontWeight: 400 },
  catChip: { border: "1.5px solid transparent", borderRadius: 100, padding: "7px 14px", fontSize: 12, cursor: "pointer", fontFamily: "'Inter',sans-serif", transition: "all .2s", fontWeight: 500 },

  // Trip setup
  setupScreen: { minHeight: "100dvh", background: "linear-gradient(160deg, #1B2B4B 0%, #2C3E6B 60%, #9B8EC4 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" },
  setupCard: { background: "#fff", borderRadius: 24, padding: "32px 24px", width: "100%", maxWidth: 480, overflowY: "auto", boxShadow: "0 12px 60px rgba(27,43,75,.3)" },
  setupTitle: { fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: 28, color: "#1B2B4B", marginTop: 8, letterSpacing: "-1px" },
  travChip: { background: "#F0EBE3", color: "#1B2B4B", borderRadius: 20, padding: "5px 14px", fontSize: 12, display: "flex", alignItems: "center", fontFamily: "'Inter',sans-serif", fontWeight: 500 },

  // Stay banner
  stayBanner: { background: "#F5F0FF", border: "1px solid #E0D5FF", borderLeft: "3px solid #9B8EC4", borderRadius: 12, padding: "12px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 },

  // Save button
  saveBtn: { background: "#F5E882", color: "#1B2B4B", border: "1px solid #F5E882", borderRadius: 10, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Inter',sans-serif", whiteSpace: "nowrap", transition: "all .2s" },
  saveBtnSaved: { background: "#D1FAE5", color: "#065F46", borderColor: "#6EE7B7" },
  saveBtnError: { background: "#FEE2E2", color: "#991B1B", borderColor: "#FCA5A5" },

  // Mobile nav
  mobileNav: { background: "#fff", borderTop: "1px solid #EDE8E1", display: "none", flexShrink: 0, paddingBottom: "env(safe-area-inset-bottom, 0px)" },
  mnavBtn: { flex: 1, padding: "10px 4px", border: "none", background: "none", color: "#C9B8A8", fontSize: 10, fontFamily: "'Inter',sans-serif", fontWeight: 500, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, transition: "color .2s" },
  mnavActive: { color: "#1B2B4B" },
};
