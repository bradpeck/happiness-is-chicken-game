# Happy Chicken! 🐔

A tiny, cheerful, browser game for little kids. Tap the screen (or press
**Space**) and the chicken lays an egg. Lay enough eggs and they all hatch
into little chicks — then the fun starts over. No losing, no reading, no
ads, no accounts, no tracking. It runs entirely from this folder.

All artwork is original inline SVG and all sounds are synthesized in the
browser — there are no image, audio, or font files, and no third-party code.

## Quick start

You need one computer to act as the host (Mac, Linux, or Windows) with
**Python 3** installed (macOS and most Linux distros already have it).
Node.js works as a fallback if Python is missing.

### Mac / Linux

```sh
./launch-lan.sh
```

(First time only, you may need: `chmod +x launch-lan.sh`)

### Windows

Double-click **`launch-lan.bat`**, or run it from a terminal.

### Manual (any OS)

```sh
cd path/to/happy-mrs-chicken-game
python3 -m http.server 8080 --bind 0.0.0.0
```

The `--bind 0.0.0.0` part is important — it makes the server listen on your
network address, not just this computer, so phones and tablets can reach it.

Then open **http://localhost:8080/happy-chicken.html** on the host computer
to check it works.

## Playing from phones, tablets, and TVs

1. Make sure the other device is on the **same Wi-Fi / home network** as the
   host computer.
2. Find the host computer's LAN IP address:
   - **macOS:** System Settings → Wi-Fi → Details… → IP Address, or run
     `ipconfig getifaddr en0` in Terminal.
   - **Linux:** run `hostname -I` (the first address is usually the one).
   - **Windows:** run `ipconfig` and look for **IPv4 Address**
     (something like `192.168.1.23`).
   - The launch scripts also print this for you.
3. On the other device, open a browser and go to:

   ```
   http://LAN-IP:8080
   ```

   for example `http://192.168.1.23:8080` — that redirects straight to the
   game (`/happy-chicken.html`).

Works in Chrome, Safari, Edge, Firefox, and Android/smart-TV browsers.

## How to play

- **Tap anywhere** (or press **Space**) → the chicken lays an egg where she
  is, then hops to a new spot, scattering eggs all over the screen. 🥚
- Lay **5 eggs** (configurable) → they wobble, crack open, and little chicks
  pop up in their shells, leap out, and peep-jump off the screen flapping
  their tiny wings. 🐤
- **Milestones:** the 10th, 50th, 100th, 250th, 500th, and 1000th egg is a
  sparkling golden egg that hatches a neon-colored chick, with a matching
  banner — collect all six on the left side of the screen. ⭐
- The counters in the top-right show total eggs laid and chicks hatched.
- Top-left buttons: **🔊 sound on/off**, **⛶ fullscreen**, **⚙️ grown-ups**.

That's the whole game — it loops forever and there is no way to lose.

## Grown-up settings (⚙️)

- **Eggs per hatch:** 3, 5, or 8 eggs before a hatch.
- **Start over:** resets both counters and clears the screen. It asks
  "Yes / No" first so little fingers can't wipe the score by accident.
- Power option: add `?hatch=N` to the URL (2–10), e.g.
  `http://192.168.1.23:8080/happy-chicken.html?hatch=4`.
- Defaults live at the top of `game.js` in the `CONFIG` object.

Nothing is saved anywhere — closing the tab forgets everything, on purpose.

## For parents: troubleshooting

**The phone/tablet can't reach the game?** Try these, in order:

1. **Same network?** The host computer and the phone must be on the same
   Wi-Fi. Watch out for: guest Wi-Fi networks, a phone still on mobile data
   (turn Wi-Fi on and mobile data off to be sure), or a computer plugged
   into a different router.
2. **Is the server actually up?** On the host, open
   `http://localhost:8080/happy-chicken.html`. If that fails, restart the
   launch script and read its output.
3. **Right IP?** IPs like `192.168.x.x`, `10.x.x.x`, or `172.16-31.x.x` are
   normal. If you see `127.0.0.1`, that's the computer itself — look again
   for the Wi-Fi adapter's address.
4. **Firewall.** The first launch may pop up a firewall question — click
   **Allow**.
   - *macOS:* System Settings → Network → Firewall → Options… → allow
     incoming connections for Python (or turn the firewall off briefly to
     test).
   - *Windows:* when the "Windows Defender Firewall" dialog appears, tick
     **Private networks** and click **Allow access**. If you missed it:
     Windows Security → Firewall & network protection → Allow an app
     through firewall → allow Python on Private networks.
5. **Test connectivity** from the phone-side: on another computer run
   `ping LAN-IP`, or open `http://LAN-IP:8080` and see whether it times out
   (network/firewall problem) or shows an error page (server problem).
6. **Port already in use?** If the script says the port is busy, run it on
   another port: `PORT=8081 ./launch-lan.sh` (then use `:8081` in the URL).
7. **Router "AP/client isolation".** Some routers (and most guest networks)
   block devices from talking to each other. Use the main (non-guest)
   network or disable isolation in the router settings.

**No sound on iPhone/iPad?** iOS only allows sound after a touch — tap the
start screen first, and check the physical mute switch.

**Fullscreen button missing?** iPhones don't support browser fullscreen;
instead use Share → *Add to Home Screen* for an app-like, chrome-free view.

## Project layout

```
happy-chicken.html   the game page (open this one)
style.css            looks, layout, animations
game.js              game logic + synthesized sounds
index.html           tiny redirect so http://LAN-IP:8080 just works
launch-lan.sh        Mac/Linux launcher (port 8080, binds 0.0.0.0)
launch-lan.bat       Windows launcher (port 8080, binds 0.0.0.0)
```

No build step, no dependencies, no telemetry, no storage. This is an
original work — no copyrighted characters, artwork, music, or assets are
used.
