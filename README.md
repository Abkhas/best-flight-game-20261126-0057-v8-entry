# WILDFIRE TANKER — Cedar Fork Air Attack

A make.fun **best-flight-game** entry (bounty `best-flight-game-20261126-0057`).
A fixed-wing water bomber fights a wildfire across Cedar Fork Valley at golden
hour: scoop 3,000 gallons off Mirror Lake, drop it on the fire line, and keep
the town standing — while fuel, wind and the spreading fire turn every sortie
into decisions.

## Play

```sh
node serve.ts            # game/ on http://localhost:8080
```

Open the page in desktop Chrome. No build step, no network request: Three.js
is vendored under `game/vendor/`, everything else is plain files under `game/`.

| Key | Action |
| --- | ------ |
| W / S | Throttle up / down |
| ← / → | Bank (turns the nose) |
| ↑ / ↓ | Pitch down / up (pull back to climb) |
| SPACE | Drop the tank |
| A / D | Rudder |
| B | Brake (on the ground) |
| P | Pause |

## The game

- **Scoop run** — fly low (under 60 ft) and slow (80–140 kt) over Mirror Lake
  to fill the 3,000-gallon tank. Too fast or too high and the scoops skip.
- **The drop** — release under 350 ft and under 200 kt over a fire zone. The
  white plume hits the orange front; containment rises, acres are saved.
- **Three zones, in priority order** — Town Edge (12 homes), Eagle Lookout
  (tower crew of 2), Black Ridge (timber). A zone you ignore keeps spreading
  with the 14-kt north-west wind, and the town loses a home per 130 acres
  burned.
- **Pick-1-of-3 loadout** — Water (wide fan, fast reload), Retardant (long
  line, holds the ridge, slow reload), Mixed (the all-rounder). Chosen on the
  briefing screen; changeable at base.
- **Fuel + BINGO** — fuel burns with throttle. At 25% the HUD orders a divert
  to Cedar Fork Base; at 0% the engine quits and you glide. A slow pass over
  the runway refills tank and fuel — the turnaround clock measures scoop to
  drop.
- **Full arc** — title (pilot slots) → briefing (fire map, wind, loadout) →
  sortie (scoop → drop → divert decisions) → debrief (score, acres saved,
  homes standing, water dropped, turnaround).

Score = acres saved × 10 + drops × 500 + homes standing × 100.

## Flown record

The four screenshots come from a single real sortie flown headlessly
through the game's own input path (`capture.mjs` — takeoff, scoop, drop on
the Town Edge, debrief). The debrief numbers:

- **Score 13,900** · 1 drop · 1,240 acres saved · 3,000 gal dropped ·
  10 of 12 homes standing · fuel 69% · flight time 01:45 ·
  turnaround 00:29 · loadout WATER.

What that sortie exercised:

- **Three priority zones, wind-driven spread** — Town Edge (12 homes),
  Eagle Lookout (tower crew of 2), Black Ridge (timber). Fire left alone
  keeps spreading downwind in the 14-kt north-west wind, and the town
  loses a home per 130 acres burned.
- **Pick-1-of-3 loadout** — Water (wide fan, fast reload), Retardant
  (long line that holds the ridge, slow reload), Mixed (all-rounder).
  Chosen on the briefing screen; changeable at base.
- **Fuel + BINGO divert** — fuel burns with throttle. At 25% the HUD
  orders a divert to Cedar Fork Base; at 0% the engine quits and you
  glide home.
- **Turnaround clock** — measured scoop to drop. A slow pass over the
  runway refills tank and fuel, and the clock tells you how tight the
  next cycle has to be.

## Screenshots

`capture.mjs` flies one real sortie headlessly through the game's own input
path — takeoff, scoop, drop on the Town Edge — and takes the four judged
shots from that flown record (cover = the drop moment, scoop run, debrief,
title). All four show the same flown numbers. `checks.json` records the
boot + play checks; `contact-sheet.jpg` is the judge's sheet.

```sh
node capture.mjs         # serves game/, flies the sortie, writes screenshots/
```

## Files

| Path | Job |
| --- | --- |
| `game/index.html` | Page, HUD panels, title / briefing / debrief screens |
| `game/src/main.js` | Boot, render loop, chase camera, drop, staging hook |
| `game/src/state.js` | World model: valley, fire zones, loadouts, score |
| `game/src/flight.js` | Flight model: throttle, scoop, drop, fuel, BINGO |
| `game/src/world.js` | Valley at golden hour: terrain, lake, town, base, fire |
| `game/src/tanker.js` | The air tanker, built from primitives |
| `game/src/hud.js` | Four-corner HUD + valley minimap |
| `game/src/screens.js` | Title, briefing, debrief |
| `game/src/audio.js` | Procedural engine / scoop / drop sound |
| `main.ts` | Hands game/ + screenshots/ to /output with dossier.json |
| `capture.mjs` | Headless flight + 4 screenshots + contact sheet + checks |
| `serve.ts` | Local static server for development |
