# Contributing / Contribuire 🐾

**EN** — Everyone is welcome! The two most wanted contributions are:
1. **New mascots** — create your own animated character (a dog, a dragon, a robot, a blob…).
2. **Improving the app** — better claude.ai integration, Windows/Linux support, a mascot picker, nicer animations, bug fixes.

**IT** — Sono benvenuti tutti! I due contributi più desiderati sono:
1. **Nuove mascotte** — crea il tuo personaggio animato (un cane, un drago, un robot, un blob…).
2. **Migliorare l'app** — integrazione con claude.ai, supporto Windows/Linux, un selettore di mascotte, animazioni migliori, fix.

---

## Create a new mascot / Creare una nuova mascotte

A mascot is a single **sprite sheet** PNG with a transparent background, laid out on a fixed grid.
Una mascotte è un unico **sprite sheet** PNG con sfondo trasparente, su una griglia fissa.

**Grid / Griglia**
- Sheet size / Dimensione foglio: **1536 × 2288 px**
- Columns / Colonne: **8** · Rows / Righe: **11**
- Cell / Cella: **192 × 208 px**
- Background / Sfondo: fully transparent (alpha) / completamente trasparente
- Frames are left-aligned in each row / i frame sono allineati a sinistra in ogni riga

**Rows / Righe** (see `assets/sprites-layout.json` and `assets/pet_request.json`)

| Row | State | Frames | Use / Uso |
|----:|-------|:------:|-----------|
| 0 | idle | 6 | resting, breathing / a riposo |
| 1 | running-right | 8 | dragging right / trascinamento a destra |
| 2 | running-left | 8 | dragging left / trascinamento a sinistra |
| 3 | waving | 4 | greeting / saluto |
| 4 | jumping | 5 | click reaction / reazione al clic |
| 5 | failed | 8 | error / errore |
| 6 | waiting | 6 | waiting for input / in attesa |
| 7 | working | 6 | Claude is thinking / Claude sta lavorando |
| 8 | review | 6 | reply ready / risposta pronta |
| 9 | look 0–7 | 8 | gaze directions, 0°=up 90°=right 180°=down 270°=left (clockwise, 22.5° steps) |
| 10 | look 8–15 | 8 | gaze directions (continued) |

**Steps / Passi**
1. Draw/render your sheet following the grid above.
2. Save it as `assets/<your-mascot>-sprites.png`.
3. For now the app loads `assets/draco-sprites.png` — swap it (or open a PR proposing a **mascot picker**, very welcome!).
4. Test with `npm start`.

Keep the same anchor/baseline across frames so the character doesn't jump around.
Mantieni la stessa base tra i frame così il personaggio non "salta".

---

## Dev setup

```bash
npm install
npm start        # run in dev / avvia in sviluppo
npm run dist     # build the .app / compila l'app
```

Open an issue or a PR — grazie! 🧡
