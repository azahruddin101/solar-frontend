# Solar for non-solar people — a guide to this project

This explains rooftop solar from zero, then shows where each idea appears in the app, the
calculations and the proposal PDF. No solar background is assumed.

- Part 1 — [How rooftop solar works](#1-how-rooftop-solar-works)
- Part 2 — [Units you will see everywhere](#2-units-you-will-see-everywhere)
- Part 3 — [The roof and the sun](#3-the-roof-and-the-sun)
- Part 4 — [The equipment](#4-the-equipment-what-is-physically-installed)
- Part 5 — [Electrical terms](#5-electrical-terms)
- Part 6 — [Money terms](#6-money-terms)
- Part 7 — [How the app calculates everything](#7-how-the-app-calculates-everything)
- Part 8 — [Reading the proposal PDF page by page](#8-reading-the-proposal-pdf-page-by-page)
- Part 9 — [What is real and what is an assumption](#9-what-is-real-and-what-is-an-assumption)
- Part 10 — [Glossary A–Z](#10-glossary-az)

---

## 1. How rooftop solar works

```text
 Sunlight ─▶ PANELS ─▶ DCDB ─▶ INVERTER ─▶ ACDB ─▶ NET METER ─▶ Home appliances
             (make DC)  (DC     (DC → AC)   (AC               │
                        safety)             safety)            └──▶ GRID (extra power is exported)
```

1. **Solar panels** turn sunlight into electricity. It comes out as **DC** (direct current — the
   kind a battery gives).
2. Homes and the power grid use **AC** (alternating current). The **inverter** converts DC to AC.
3. Safety boxes sit on both sides of the inverter: the **DCDB** on the panel side and the **ACDB**
   on the house side. They hold fuses, breakers and surge protection.
4. The power first feeds the building. If the panels make more than the building is using, the
   extra flows out to the grid. If they make less (evening, clouds), the building draws from the
   grid as usual.
5. A **net meter** counts both directions. The electricity bill is for the *net* amount:
   what was taken from the grid minus what was given to it. This arrangement is **net metering**.

This project designs **grid-tied** systems: connected to the grid, **no batteries**. That is the
most common and cheapest kind of rooftop system. (Systems with batteries are "hybrid" or
"off-grid" — not modelled here.)

The single picture of this chain is the **single line diagram (SLD)** on the PDF's electrical page.

---

## 2. Units you will see everywhere

People mix these up constantly. The key idea: **kW is a rate, kWh is an amount.**

| Unit | What it measures | Everyday comparison |
| --- | --- | --- |
| **W** (watt) | Power — how fast electricity is made or used *right now* | A speedometer reading |
| **kW** (kilowatt) | 1,000 W | A 1 kW heater uses 1 kW while it is on |
| **kWh** (kilowatt-hour) | Energy — an *amount* of electricity. 1 kW running for 1 hour | Kilometres driven |
| **Unit** | In India, "1 unit" on an electricity bill = **1 kWh** | — |
| **Wp / kWp** (watt-peak) | A panel's rated power under perfect lab conditions | A car's top speed on a test track |
| **MWh** | 1,000 kWh | Used for 25-year totals |

**Why "peak"?** A "540 W" panel produces 540 W only under *Standard Test Conditions* (STC):
bright sun of 1000 W/m², panel at 25 °C. On a real roof it is usually less — hotter panels, a
lower sun, dust, clouds. So **kWp describes the size of the system you bought**, not what it
gives at any moment.

> Example: 10 panels × 540 Wp = 5,400 Wp = **5.4 kWp** system.
> Over a year in Pune it might produce about 5.4 × 1,450 ≈ **7,800 kWh** (= 7,800 units).

In the app: the dark result card shows "18 panels · 7.2 kW" (the system size, really kWp) and
"Generates 861 units / month" (energy).

---

## 3. The roof and the sun

### Tilt

The angle the panel makes with the ground. 0° = lying flat, 90° = standing like a wall.
A good rule: **tilt ≈ your latitude** (Pune is at 18.5° N, so ~15–20° works well). Flatter favours
summer, steeper favours winter. Flat-roof systems in India commonly use 10–20°.

*In the app:* "Tilt" slider under **Adjust design**. It shows the best tilt for the location
("best 17°"). Default is 15°.

### Azimuth (facing direction)

The compass direction the panel faces, in degrees clockwise from north:
0° = North, 90° = East, **180° = South**, 270° = West.

In the northern hemisphere (India, Europe, USA) the sun is in the southern sky, so panels should
face **south (180°)**. East or west facing loses roughly 10–20%; north facing is poor.

*In the app:* by default panels follow the building's own edge that points closest to the
equator (so rows line up with the roof), shown in the PDF as e.g. "180° S".

### Flat and sloped roofs

| Roof shape | What it is | How panels are mounted in the app |
| --- | --- | --- |
| **Flat** | Concrete terrace, usually with a parapet | On a tilted frame with front and back legs; you choose tilt and facing |
| **Single slope (shed)** | One plane, high on one side and low on the other | **Flush**: panels lie flat on the slope on rails and roof hooks |
| **Two slopes (gable)** | Two planes meeting at a **ridge** (the top line) | Flush on each slope; a group never crosses the ridge |

**Pitch** is how steep a sloped roof is, in degrees (10° gentle, 40° steep). The **eave** is the
low edge of the slope, where the wall ends. On a sloped roof the panel's tilt *is* the pitch and
its facing *is* the direction the slope faces — you cannot choose them, so a slope facing the
equator (south in India) produces more than the one facing away. The app fills the better slope
first when you size by bill or kW.

*In the app:* step 2 (Roof) → pick the roof shape, then adjust it on the picture: **click the edge
where the roof is lowest** (it turns orange) and, for two slopes, **drag the white dot** to move the
ridge. A live 3D preview updates as you go. The two slopes do not have to match: under **Size of
each slope** type each side's **width** (measured on the plan) and how far it **climbs** in metres —
for example one side 1 m and the other 2 m. The angle is worked out for you, and the side that
climbs more ends up with a lower edge.

### Irradiance and irradiation

- **Irradiance** = how strong the sunlight is right now, in W/m².
- **Irradiation** = sunlight energy collected over time, in kWh/m².
- **POA (plane of array)** = the sunlight that actually lands on the *tilted* panel surface,
  which is what matters.

### Shading

Shadow on even part of a panel reduces its output a lot — and because panels are wired in a chain
(see *strings* below), one shaded panel can drag down its neighbours. Shade sources on a roof:

| Source | What it is | In the app |
| --- | --- | --- |
| **Parapet** | The low boundary wall around a flat roof | Height and thickness per roof section |
| **Roof on roof** | A raised part — staircase room (mumty), lift room | Traced as a second, taller roof section |
| **Obstacles** | Water tank, AC unit, dish, chimney | Marked by dragging over them ("block") |
| **Trees** | Nearby trees | Marked as a circle with a height |
| **Other panels** | A front row shading the row behind it (*inter-row shading*) | Handled automatically |

**Setback** = a strip left empty along the roof edge (default 0.6 m) for safety and walking
access. **Row gap / pitch** = spacing between rows so they don't shade each other in winter, when
the sun is lowest.

The 3D view's sun slider (Winter / Summer / Equinox / Today, and time of day) lets you *see* the
shadows move. "Shading loss 0.1 %" in the PDF means shadows cost 0.1 % of the year's energy.

---

## 4. The equipment (what is physically installed)

### Solar panel (PV module)

"PV" = photovoltaic = makes electricity from light. "Module" is the trade word for a panel.
Each one is a glass-fronted frame of about 2.3 × 1.1 m weighing 25–30 kg.

What the app stores for each panel (Dashboard → Product catalog):

| Field | Meaning |
| --- | --- |
| **Brand / Model** | Manufacturer and product name (Waaree, Tata Power Solar, Adani…) |
| **Watt (Wp)** | Rated power. Today's rooftop panels are roughly 400–600 Wp |
| **Length / Width (m)** | Physical size — decides how many fit on the roof |
| **Manufacture year** | Newer stock is preferable; shown on the proposal |
| **Warranty (years)** | Usually 25–30 years on performance |
| **Price per panel** | Your selling price; drives the proposal total |

Technology names you will see in model names: **Mono PERC**, **TOPCon**, **HJT** — generations of
cell design, each a little more efficient. **Bifacial** panels also catch light from the back.
**Degradation**: panels slowly lose output, about 0.5 % per year (the app's default).

**Orientation: portrait vs landscape** — whether the panel's long side runs up the slope
(portrait) or across it (landscape).

### Mounting structure

The metal frame that holds panels at the chosen tilt. On a flat concrete roof:

```text
        panels (tilted)
      ╱▔▔▔▔▔▔▔▔▔▔▔▔╲          ← purlins / rails run across, panels clamp onto them
     ╱   rafter      ╲         ← rafters run up the slope
    │                 │
  front leg        back leg    ← pillars (columns). Back is taller: that creates the tilt
    │                 │
  ▄▄█▄▄             ▄▄█▄▄      ← base plate bolted to a concrete pedestal (or ballast block)
 ═══════════ roof slab ═══════════
```

| Part | What it does | In the BOM |
| --- | --- | --- |
| **Table** | One frame carrying a block of panels, e.g. "2 × 9" = 2 rows × 9 columns | Mounting structure schedule |
| **Pillar / column / leg** | Vertical posts. **Front leg** short, **back leg** tall | "Pillars — MS angle… 0.50 m × 4, 1.55 m × 2" |
| **Cut list** | How many posts of each length to cut | Same line |
| **Rafter** | Sloping beam from front leg to back leg | "Rafters 80x40x3 RHS" |
| **Purlin / module rail** | Horizontal rails the panels sit on | "Purlins / module rails 41x41 C-channel" |
| **Base plate** | Flat steel plate under each leg | "Base plates 200x200x8" |
| **Anchor bolt** | Bolts fixing the plate down | "Anchor bolts M12" (M12 = 12 mm thread) |
| **Pedestal / ballast** | Small concrete block under each leg — spreads load and avoids drilling through waterproofing | "RCC pedestals / ballast 300 x 300 x 300" (mm) |
| **Mid clamp** | Clamp *between* two panels, holding both | "Mid clamps" |
| **End clamp** | Clamp at the outer edge of a row | "End clamps" |
| **Elevated structure** | Tall frame (2–3 m) so the terrace stays usable underneath | Table type "Elevated" |

Steel shorthand: **MS** = mild steel (needs paint), **GI** = galvanised iron (zinc coated, resists
rust), **HDG** = hot-dip galvanised (best). **RHS / SHS** = rectangular / square hollow section
(box tube). "80x40x3" = 80 mm × 40 mm, 3 mm thick. Pole shapes in the catalog:
**L-shape** (angle), **cylindrical** (round pipe), **square** (box section). Poles are priced
**per foot**, because that is how steel is bought locally.

### Inverter

Converts DC to AC, and also finds the voltage at which panels give the most power (**MPPT** —
maximum power point tracking). A **string inverter** serves the whole array; larger ones have
several MPPT inputs so groups facing different ways can be optimised separately.
**Single-phase** (normal homes, up to ~6 kW) vs **three-phase** (bigger homes, commercial).

### Protection and cabling

| Item | Meaning |
| --- | --- |
| **DCDB** | DC distribution box: fuses + surge protection between panels and inverter |
| **ACDB** | AC distribution box: breaker (MCB) + surge protection between inverter and house |
| **SPD** | Surge protection device — absorbs voltage spikes (lightning, grid faults) |
| **MCB** | Miniature circuit breaker — the trip switch |
| **DC cable 4 sq.mm** | Sun-proof cable from panels; "4 sq.mm" is the copper cross-section |
| **MC4 connector** | The standard click-together waterproof plug on every panel |
| **AC cable "3C x 6 sq.mm"** | 3-core, 6 mm² (single-phase). "4C x 16 sq.mm" = 4-core for three-phase |
| **Earthing kit** | Copper rod in the ground; carries fault current away safely |
| **Lightning arrestor** | Rod above the array that takes a lightning strike to earth ("ESE type" is a common variety) |
| **Net meter** | Two-way meter from the electricity company (DISCOM) |

**BOM** = bill of materials: the shopping list. **BOS** = balance of system: everything that is
*not* panels or mounting poles — inverter, cables, boxes, earthing, labour.

---

## 5. Electrical terms

| Term | Plain meaning |
| --- | --- |
| **Voltage (V)** | Electrical "pressure" |
| **Current (A, amps)** | Electrical "flow" |
| **Power (W)** | Voltage × current |
| **Voc** (open-circuit voltage) | The highest voltage a panel can show (nothing connected). ~40–50 V for a modern panel |
| **Isc** (short-circuit current) | The highest current a panel can push. ~10–14 A |
| **String** | Panels wired one after another in a chain (**series**). Voltages add up; current stays the same |
| **Voc cold** | Voltage rises when panels are cold, so the worst case is a freezing sunny morning. The app uses Voc × 1.12 |
| **DC/AC ratio** | Panel kWp ÷ inverter kW. 1.1–1.3 is normal (panels rarely hit full rating, so a slightly smaller inverter is cheaper and loses almost nothing) |

**Why strings matter:** every inverter has a maximum input voltage (600 V single-phase, 1100 V
three-phase in this app). Too many panels in a string and a cold morning could exceed it and
damage the inverter; too few and the inverter won't start. So the app works out the allowed
string length and splits panels into strings of similar size ("S1 (9)", "S2 (9)").
The PDF's **String layout** page colours each string so an electrician can see which panels join.

---

## 6. Money terms

| Term | Meaning | Where it is set |
| --- | --- | --- |
| **Tariff** | Price paid per unit (kWh) of grid electricity | Dashboard → Product catalog → Pricing |
| **Monthly bill → units** | bill ÷ tariff = units used per month | Designer: "Size the system by → Monthly bill" |
| **Cost per kW / per kWp** | Total price ÷ system size. A quick way to compare quotes | PDF "Investment" tile |
| **Balance-of-system cost per kW** | Your charge for everything except panels and poles | Pricing |
| **Savings** | Units the panels produce × tariff (money not paid to the grid) | — |
| **Tariff escalation** | Grid prices rise yearly (default 3 %), so savings grow | Design finance defaults |
| **Payback period** | Years until cumulative savings equal what was paid | PDF cover + financial page |
| **ROI** | (25-year savings − cost) ÷ cost | PDF summary |
| **Net position** | Cumulative savings − cost. Negative until payback, positive after | PDF chart "Net position over 25 years" |
| **Performance ratio (PR)** | Real-world losses bundled into one number (heat, dust, wiring, inverter). Default 85 % | — |
| **GSTIN** | Indian tax registration number, printed for the company | Settings → Company profile |
| **DISCOM** | The local electricity distribution company that approves net metering | Mentioned in terms |

**System price in this app:**

```text
Total = (panels × price per panel)
      + (total pole length in feet × price per foot)
      + (system kW × balance-of-system cost per kW)
```

---

## 7. How the app calculates everything

All of this runs in the browser (`src/lib/`). The backend only stores data.

| Step | What happens | File |
| --- | --- | --- |
| 1. Location | Address → latitude/longitude; everything is measured in metres around that point (x = east, y = north) | `geo.js` |
| 2. Roof | You trace the outline; it becomes a polygon with height and parapet | `model.js`, `geometry.js` |
| 3. Sun path | Sun position for every hour of 12 representative days, from latitude | `sun.js` |
| 4. Yield per kWp | Clear-sky sunlight on the tilted panel, scaled by how sunny the place really is. Google's **Solar API** supplies measured sunshine for the building when available; otherwise a regional cloudiness factor is used | `energy.js` |
| 5. Layout | Tables of panels are packed inside the roof, respecting setback, obstacles and row spacing | `model.js`, `autofill.js` |
| 6. Sizing | **Bill:** units needed ÷ units one panel makes per month. **kW:** kW × 1000 ÷ panel watt. Rounded **up** to whole panel rows, capped by what the roof fits | `StepSimpleDesign.js` |
| 7. Shading | For each panel and each sun position, a ray is cast toward the sun; if a parapet, tank, tree or another table is in the way and tall enough, that hour's direct sunlight is lost | `shading.js` |
| 8. Energy | Σ over panels: kWp × yield × (1 − shading) × performance ratio (85 %) → kWh per year, split by month | `useDesign.js` |
| 9. Structure | Leg heights from tilt and roof level, rounded up to 50 mm; rafters, purlins, plates, bolts counted per table | `structure.js` |
| 10. Electrical | Inverter = kWp ÷ 1.15, next size up from a fixed list; string lengths from Voc and inverter voltage; BOM lines | `electrical.js` |
| 11. Money | 25 yearly rows: energy falls 0.5 %/yr, tariff rises 3 %/yr; payback where cumulative savings cross the cost | `energy.js` |
| 12. PDF | Branded A4 document | `pdf.js`, `pdfCover.js`, `pdfRichText.js` |

**Specific yield** (kWh per kWp per year) is the fairest way to compare sites: ~1,400–1,600 across
most of India, ~900–1,100 in northern Europe. If the PDF shows ~1,000 for an Indian roof,
something is shading it.

---

## 8. Reading the proposal PDF page by page

| Page | What the client sees | Terms used |
| --- | --- | --- |
| 1 Cover | Company branding, the 3D roof, system size, yearly generation, year-1 savings, payback, who it is for / from | kWp, kWh, payback |
| 2 Summary | A letter, eight key figures, system at a glance, environmental benefit | specific yield, ROI, shading loss, CO₂ avoided |
| 3 System details | Panel brand/model/watt/size/year/warranty; roof area, height, parapet; tilt and facing; structure schedule | tilt, azimuth, front/back leg |
| 4 PV array layout | Top-down drawing with roof dimensions, north arrow, scale | setback, tables |
| 5 String layout | Same drawing coloured by string | string |
| 6 Electrical design | Single line diagram; inverter, DC/AC ratio; string table | Voc, Voc cold, Isc, MPPT |
| 7 Bill of materials | Every item and quantity | BOM, BOS, clamps, DCDB/ACDB |
| 8 Energy & financials | Monthly production bars, 25-year net-position chart, yearly table, assumptions | degradation, escalation, PR |
| 9 Price & acceptance | Price lines and total, your terms & conditions, e-signature, client sign box, QR code | — |

**Environmental benefit** uses 0.7 kg of CO₂ avoided per kWh (roughly India's grid) and 21 kg of
CO₂ absorbed per tree per year. Both are printed as estimates.

---

## 9. What is real and what is an assumption

Useful to know before promising numbers to a client.

**Calculated from the actual design:** panel count, system kWp, roof area and dimensions, tilt and
facing, shading loss, yearly and monthly energy, number of legs and their cut lengths, rafter and
rail lengths, clamps, number and length of strings, price, savings, payback.

**Fixed rules of thumb in the code (not site-specific):**

- Inverter sizes limited to 3, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100 kW; sized at kWp ÷ 1.15.
- Panel **Voc / Isc** are estimated from wattage unless provided — a real datasheet value is better.
- DC cable assumes ~15 m from each string to the inverter; AC cable is a flat 25 m.
- Earthing (3 pits), one lightning arrestor, steel section names and pedestal size are constants.
- Performance ratio 85 %, degradation 0.5 %/yr, tariff escalation 3 %/yr.
- No batteries, subsidies, loans, export tariffs or fixed meter charges are modelled.

**Always needs a site visit / engineer:** roof strength and waterproofing, wind loading, real cable
routes, the building's sanctioned load and phase, DISCOM rules and net-metering limits, and any
shade the satellite image does not show. The PDF says "indicative only — verify on site" for this reason.

---

## 10. Glossary A–Z

| Term | Meaning |
| --- | --- |
| **AC** | Alternating current — what homes and the grid use |
| **ACDB** | AC distribution (protection) box between inverter and house |
| **Array** | A group of panels working together |
| **Azimuth** | Compass direction a panel faces (180° = south) |
| **Ballast** | Heavy block holding a structure down without drilling the roof |
| **Bifacial** | Panel that also generates from light hitting its back |
| **BOM** | Bill of materials — the parts list |
| **BOS** | Balance of system — everything except panels (and here, poles) |
| **Cut list** | Number of posts to cut at each length |
| **DC** | Direct current — what panels produce |
| **DCDB** | DC protection box between panels and inverter |
| **DC/AC ratio** | Panel kWp ÷ inverter kW |
| **Degradation** | Yearly loss of panel output (~0.5 %) |
| **DISCOM** | Electricity distribution company |
| **Earthing** | Safety connection to the ground |
| **Grid-tied** | Connected to the public grid, no battery |
| **GSTIN** | Indian GST registration number |
| **Inverter** | Converts DC to AC |
| **Irradiance** | Sunlight strength, W/m² |
| **Isc** | Short-circuit current of a panel |
| **kW / kWp** | Power / rated peak power of the system |
| **kWh (unit)** | Energy; what the bill charges for |
| **Landscape / portrait** | Panel laid long-side across / up the slope |
| **MC4** | Standard panel connector |
| **MCB** | Circuit breaker |
| **Module** | Trade name for a solar panel |
| **MPPT** | Inverter function that extracts maximum power |
| **Mumty** | Staircase room on a terrace ("roof on roof") |
| **Net metering** | Billing on grid import minus export |
| **Parapet** | Low wall around a flat roof |
| **Payback** | Years to recover the investment |
| **PERC / TOPCon / HJT** | Solar cell technologies |
| **POA** | Plane of array — sunlight on the tilted panel |
| **PR** | Performance ratio — real-world efficiency of the whole system |
| **Purlin / rail** | Horizontal member panels are clamped to |
| **PV** | Photovoltaic — electricity from light |
| **Rafter** | Sloping member between front and back legs |
| **ROI** | Return on investment |
| **Setback** | Clear strip kept along roof edges |
| **SLD** | Single line diagram of the electrical system |
| **SPD** | Surge protection device |
| **Specific yield** | kWh produced per kWp per year |
| **STC** | Standard test conditions used for panel ratings |
| **String** | Panels connected in series |
| **Table** | One mounting frame with its block of panels |
| **Tariff** | Price per kWh of grid electricity |
| **Tilt** | Panel angle from horizontal |
| **Voc** | Open-circuit voltage of a panel |
