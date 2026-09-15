# CodeClash

Head-to-head competitive coding rooms. Someone uploads a problem and test
cases, shares a 5-letter room code, and whoever clears every test case
first wins — no accounts, no profiles, just a winner and a loser when
time's up.

## Requirements

- **Node.js 18+**
- **A JDK** on the machine running the server (`javac` + `java` on PATH) —
  needed to judge Java submissions. A JRE alone is not enough.
- **g++** with C++17 support — needed to judge C++ submissions.

Check both before running:
```bash
javac -version && java -version
g++ --version
```
If either is missing, install a JDK (e.g. `sudo apt-get install default-jdk`)
and/or `g++` (`sudo apt-get install g++`).

## Run it

```bash
npm install
npm start
```

Then open `http://localhost:3000` in two browser tabs (or two devices on
the same network) to try a match by yourself.

## How a match works

1. **Host creates a room** — problem title, description, one or more test
   cases (input + expected output), a time limit, and which languages
   (Java/C++) are allowed. The server hands back a 5-letter room code.
2. **Others join** with the code and a nickname (no accounts — nicknames
   just need to be unique within that room).
3. **Host starts the match.** Everyone sees the problem statement, one
   sample test case, and a countdown clock. Everyone gets a code editor
   for their chosen language.
4. **Players submit** as many times as they like. Each submission is
   actually compiled and run against every test case server-side.
   - First player to pass **all** test cases wins immediately.
   - If time runs out first, whoever passed the **most** test cases wins;
     a tie on both count and time is a draw.
5. Everyone lands on a **winner/loser** screen with the final leaderboard.
   No history is kept anywhere — close the tab and it's gone.

## Architecture

```
server/
  index.js   Express static server + Socket.io event handlers (the game loop)
  rooms.js   In-memory room/participant state, room-code generation, leaderboard sort
  judge.js   Writes submitted source to a temp dir, compiles it, runs it against
             each test case with a timeout, diffs stdout (whitespace-tolerant)
public/
  index.html Single-page app: home / create / join / lobby / match / result views
  style.css  Visual theme (see below)
  app.js     View routing + all Socket.io client wiring, countdown timer, editor
```

State is **entirely in-memory** on the server (a `Map` of room code →
room). Restarting the server clears every room. There's no database
because there's nothing to persist — that's the point of "no profiles."

### The judge, honestly

For each submission, the server:
1. Writes the code to a fresh temp directory (`Main.java` or `main.cpp`).
2. Compiles it (`javac` or `g++ -O2 -std=c++17`) with a 15s timeout.
3. Runs the compiled program against every test case with a 5s timeout
   per case, feeding `input` on stdin and diffing trimmed stdout against
   `output`.
4. Deletes the temp directory.

This is a **real judge**, not a simulation — it was tested end-to-end
with an actual C++ compile/run cycle. What it is *not* is a hardened
sandbox: submitted code runs as the server's own OS user with no
container, cgroup, or seccomp isolation, just process timeouts and an
output-size cap. That's fine for playing with friends on a machine you
trust; it is **not** safe to expose to the open internet as-is. If you
want to deploy this publicly, put the `judge.js` execution step inside a
locked-down container (gVisor, Firecracker, Docker with dropped
capabilities and no network) before letting strangers submit code to it.

### Visual theme

Built around a deep indigo canvas with flat geometric accent shapes
(circles, triangles, a squircle) in warm gold, teal, coral, and violet —
in the spirit of Brilliant's illustration style, but abstract rather
than literal. Type is Manrope throughout (JetBrains Mono for code and
room codes) so headings and body text share one confident geometric-sans
voice instead of mixing families.

## Known limitations / next steps

- No reconnect handling — if a player's tab closes mid-match, their slot
  just stops updating (the room doesn't wait for them or kick them).
- Max 8 players per room; no spectator mode.
- Hidden test cases are hidden from the *player's own results panel* too
  (only pass/fail per case, not the actual diff) — intentional, so it
  can't be used to reverse-engineer inputs you weren't given, but worth
  knowing before you rely on it for debugging your own solution.
- No rate limiting on submissions — a player could spam "Run & submit."
- Language execution has no memory/CPU cgroup limits, only a wall-clock
  timeout — see the judge note above before deploying publicly.
