# The visiting card — QR and landing page

Written 6 Aug 2026.

Someone is handed a card, scans it, and is standing there with a phone. That is
the whole design brief. The page opens on what is going wrong for them, not on
how we file our services.

---

## For the printer

**Print the QR at 22–25mm square. 18mm is the floor. Use the SVG. Do not crop
the blank border.**

| | |
|---|---|
| File | `assets/card/card-qr-brand.svg` (ink `#14161A` on white) |
| Fallback | `assets/card/card-qr-mono.svg` (pure `#000000` on white) |
| Raster, if a vector cannot be placed | the matching `.png`, 2400×2400 |
| Encodes | `HTTPS://INDIZILLA.COM/CARD` |
| Symbol | QR version 2, 25×25 modules, ECC level Q |
| With quiet zone | 33×33 — the 4-module blank border is part of the artwork |

Printed module size, which is what decides whether it scans:

| Printed square | Module |
|---|---|
| 25mm | 0.76mm |
| 22mm | 0.67mm |
| 18mm | 0.55mm |

Below about 0.5mm a phone camera starts to struggle, so 18mm is a floor rather
than a target.

**The blank border is not padding.** Cropping the quiet zone to make the square
look tidier is the single most common reason a card QR fails to scan. If the
design needs the symbol to sit closer to something, move the something.

**Use the mono file if the press flattens or separates colour.** The brand file
is brand ink, which is near-black and scans like black. Do not re-colour the
dark modules to the acid lime (`#DAFE31`) — it is a light colour, and a QR needs
dark-on-light to be read at all.

---

## Why the URL is shouting

`HTTPS://INDIZILLA.COM/CARD`, in capitals, on purpose.

Uppercase A–Z, digits and `/ : . -` all sit in QR **alphanumeric** mode at about
5.5 bits per character. Lowercase and `_` force **byte** mode at 8. Measured on
this exact URL:

| Encoded as | Mode | Version | Modules |
|---|---|---|---|
| `https://indizilla.com/card` | Byte | 3 | 29 |
| `HTTPS://INDIZILLA.COM/CARD` | Alphanumeric | **2** | **25** |

Fewer modules is the whole game, because module size is printed size divided by
module count. Dropping 29 → 25 makes each square **16% larger** at the same
printed size, at the same error-correction level. That is the difference between
a card that scans from a normal distance and one that needs a second try.

The page itself lives at `/visiting_panel`, with an underscore — but the QR
never encodes that path, so the underscore costs nothing.

### Apex, not www

The brief says to prefer `WWW.` when it fits the smaller version, because it
skips the apex→www hop. Measured here, it does not fit:

| | Version | Modules |
|---|---|---|
| `HTTPS://INDIZILLA.COM/CARD` | 2 | 25 |
| `HTTPS://WWW.INDIZILLA.COM/CARD` | 3 | 29 |

Those four extra characters push it over the version-2 alphanumeric capacity.
So the apex wins, and the card accepts one extra redirect hop:

```
https://indizilla.com/CARD
  → 308 → https://www.indizilla.com/CARD     (existing apex→www rule)
  → 307 → https://www.indizilla.com/visiting_panel
  → 200
```

That is the right trade. A redirect hop costs milliseconds and cannot fail in a
way the user sees. Module size is what makes a scan fail, and it is the one
thing that cannot be changed after the cards are printed.

### The redirect is deliberately temporary

`vercel.json` sets `"permanent": false`, so `/CARD` answers **307**, not 308. A
308 is cached by browsers more or less forever, and a printed card cannot be
reissued — the destination has to stay repointable for as long as the cards are
in circulation. Do not "tidy" this to a permanent redirect.

### Case-insensitivity is explicit

Scheme and host are case-insensitive per RFC 3986. **Paths are not.** Since the
QR encodes `/CARD`, the route matches all sixteen casings by construction:

```json
"source": "/:card([cC][aA][rR][dD])"
```

The character class rather than a matcher flag, so this holds regardless of how
Vercel configures path-to-regexp. `/cards` and `/cardholder` correctly do not
match.

---

## The page

`visiting_panel.html`, served at `/visiting_panel` by `cleanUrls`.

- **`noindex, follow`.** A card is handed over in person; this page should not
  compete with the real landing pages in search. `follow` so its outbound links
  still pass authority.
- **Two audiences, two paths.** Someone already trading wants a symptom fixed;
  someone with an unbuilt idea wants to know if it will work. One
  undifferentiated list wastes the scan, so the page forks immediately and each
  side carries its own call to action.
- **Symptoms, not a service taxonomy.** Every line is the "Problem:" sentence
  that `services.html` already uses for that service, verbatim, and each one is
  itself the link.
- **Mobile-first.** Verified at 390px with no horizontal overflow and every tap
  target at least 44px.

### Drift

The symptom copy is duplicated from `services.html`, and the site has no build
step to generate one from the other. `test/visiting-panel.test.js` closes the
gap in both directions: every symptom on the panel must appear verbatim on the
services page, every problem on the services page must reach the panel, and each
symptom must link to the section that actually contains it. Reword one file and
the test fails.

It also asserts the QR is still 33 modules across — if that number grows, the
symbol got denser and the printed squares got smaller.

---

## Regenerating

The generator and decoder are throwaway scripts, not project dependencies —
nothing here needs `node_modules`. To rebuild the artwork:

```bash
npm install qrcode jsqr pngjs && node -e "const Q=require('qrcode');Q.toFile('assets/card/card-qr-mono.png','HTTPS://INDIZILLA.COM/CARD',{errorCorrectionLevel:'Q',margin:4,width:2400})"
```

If the URL ever changes, re-measure the version before reprinting — a longer
path can quietly push the symbol to version 3 and shrink every module.

---

## Still to verify live

The redirect chain and the page were verified locally against the real
`vercel.json` (all sixteen casings resolve to `/visiting_panel` with a 200; the
generated SVG and PNG both decode back to `HTTPS://INDIZILLA.COM/CARD`). The
final hop through production can only be confirmed after a deploy — until then
`https://www.indizilla.com/card` still answers 404.

**Do not send artwork to a printer until that check has been run against the
live site.**
