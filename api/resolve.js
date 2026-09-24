// Flokk — resolve a shared map link into coordinates.
//
// Lives at /api/resolve on Vercel. Browsers aren't allowed to follow a
// maps.app.goo.gl link (the browser blocks reading another site's response),
// which is why Flokk could never work out where a pinned place actually is.
// A server has no such restriction, so this follows the link and reads the
// coordinates out of the far end.
//
// Two details matter, both learned the hard way by others:
//  1. Do NOT send a browser User-Agent. Google answers those with a JavaScript
//     page instead of a clean redirect, and there is nothing to read.
//  2. Take the coordinates from !3d/!4d, which is the actual pin. The @lat,lng
//     in the URL is only where the map camera happened to be pointing.
//
// Google does not document this format, so it can change. Everything here fails
// quietly and Flokk carries on without coordinates rather than breaking.

const ALLOWED_HOSTS = [
  "maps.app.goo.gl",
  "goo.gl",
  "g.co",
  "maps.apple.com",
  "surl.amap.com",
  "amap.com",
  "www.amap.com",
];

function hostAllowed(host) {
  const h = String(host || "").toLowerCase();
  if (ALLOWED_HOSTS.includes(h)) return true;
  // google.com, google.co.jp, google.com.sg and friends
  return /^(www\.|maps\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(h);
}

function readCoords(url) {
  const s = String(url || "");
  const ok = (lat, lng) => {
    const a = parseFloat(lat), b = parseFloat(lng);
    if (!isFinite(a) || !isFinite(b)) return null;
    if (Math.abs(a) > 90 || Math.abs(b) > 180) return null;
    if (a === 0 && b === 0) return null;
    return { lat: a, lng: b };
  };
  let m;
  // The resolved pin. This is the one we want.
  if ((m = s.match(/!3d(-?\d+(?:\.\d+)?).*?!4d(-?\d+(?:\.\d+)?)/))) return ok(m[1], m[2]);
  // Apple and generic
  if ((m = s.match(/[?&](?:ll|sll|center)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/))) return ok(m[1], m[2]);
  // Camera position. Less precise, but better than nothing.
  if ((m = s.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/))) return ok(m[1], m[2]);
  if ((m = s.match(/[?&](?:q|query|daddr|destination)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/))) return ok(m[1], m[2]);
  return null;
}

function readName(url) {
  try {
    const m = String(url).match(/\/place\/([^/@?#]+)/);
    if (!m) return null;
    const name = decodeURIComponent(m[1].replace(/\+/g, " ")).trim();
    if (!name || /^-?\d+(\.\d+)?,/.test(name)) return null;
    return name.slice(0, 120);
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const raw = (req.query?.url || "").toString().trim();
  if (!raw) return res.status(400).json({ ok: false, error: "no url" });

  let start;
  try { start = new URL(raw); } catch { return res.status(400).json({ ok: false, error: "bad url" }); }
  if (start.protocol !== "https:" && start.protocol !== "http:") {
    return res.status(400).json({ ok: false, error: "bad protocol" });
  }
  if (!hostAllowed(start.hostname)) {
    // Only ever follow map links. Never become an open proxy.
    return res.status(400).json({ ok: false, error: "host not allowed" });
  }

  let url = start.toString();
  let found = null;
  let name = null;

  try {
    for (let hop = 0; hop < 6; hop++) {
      found = readCoords(url);
      name = name || readName(url);
      if (found) break;

      const r = await fetch(url, {
        redirect: "manual",
        headers: {
          // Deliberately not a browser UA. A browser UA gets a JavaScript
          // page back instead of a redirect we can follow.
          "User-Agent": "Flokk/1.0 (+trip planner link resolver)",
          "Accept-Language": "en",
        },
      });

      const next = r.headers.get("location");
      if (!next) {
        // No more redirects. Sometimes the coordinates are in the body.
        if (r.status === 200) {
          const body = (await r.text()).slice(0, 200000);
          found = readCoords(body) || null;
          name = name || readName(body);
        }
        break;
      }
      url = new URL(next, url).toString();
      if (!hostAllowed(new URL(url).hostname)) break;
    }
  } catch {
    return res.status(200).json({ ok: false, error: "lookup failed" });
  }

  if (!found) return res.status(200).json({ ok: false, resolved: url, name: name || null });

  // A place never moves, so this can be cached for a very long time.
  res.setHeader("Cache-Control", "public, s-maxage=31536000, max-age=86400");
  return res.status(200).json({
    ok: true,
    lat: found.lat,
    lng: found.lng,
    name: name || null,
    resolved: url,
  });
}
