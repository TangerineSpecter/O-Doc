# 武道大会 UI
Direction: framed-sheet, seed 1347177134. Keep project palette and type.
Question / bracket: Who won, and which actual matches led to the title?
Question / list: Where is the match report for a given round and pair?
Inventory: event date, participant count, completion status, next draw time.
Inventory: preliminary rounds, actual entrant count, match count, scheduled time.
Inventory: two participants, winner, bye, pending match, report action.
Inventory: champion identity and existing anime trophy; bronze match where present.
Inventory: rewards remain secondary disclosure; report remains a modal.
Finding: scaling SVG made type unreadable; wide rows separated related participants.
Face: warm orange used only for winners and championship route; trophy is the anchor.
Composition: grey frame / white sheet; rail for rounds, paired compact match rows.
Adaptation: preserve app capsule view controls; no global sidebar inside a modal.
Mobile: daily rounds first, horizontal round navigation; bracket is opt-in local scroll.

ROUND 2
Seen in one second: winner and paths on the bracket; paired competitors on the daily list.
Idea (one sentence): Treat the event as a readable match sheet, with the anime trophy at the meeting point of real advancement paths.
Live thing: hover/focus path tracking and independently opened match reports.
Layout words by section: controls=grey frame / bracket=white sheet with converging paths / list=round rail and paired rows.
Scores: design 7.5 · usability 8 · creativity 7 · content 8 → overall 7.6
Caps applied: none from marketing-only image/motion rules; existing outer application modal excluded from scoped component scoring.
Top three problems, screenshots and fixes:
1. /tmp/tournament-after/desktop-fold.jpg: small match text; fixed HTML nodes at 13px instead of scaled SVG text.
2. /tmp/tournament-final-inspect/tablet-fold.jpg: preliminary label wraps awkwardly; restored 180px rail and non-wrapping count.
3. /tmp/tournament-final-inspect/tablet-fold.jpg: rail metadata contrast 4.4:1; darkened to slate-600.

App critique:
1. Champion is the bracket anchor. List puts competing names together and exposes reports in one click.
2. Shared frame/sheet edges; list uses two columns on wide screens, one otherwise. Sparse final round has natural height.
3. Orange indicates winners, champion route and selected view; trophy remains the visual signature.
4. Mock 80 entrants, 40 preliminary matches; main rounds 40/20/10/5/3/2 have 20/10/5/3/2/1 matches. Labels derive from data and agree between views.
5. Empty event says awaiting start; no opponent says bye, no artificial zero competitor. Counts label matches.
6. Orange swatch matches route. Existing reconstruction tests confirm all edges follow real winners. Fixed-size HTML nodes align with SVG endpoints.
7. Phone opens daily list with locally scrolling round navigation; optional bracket scrolls locally instead of shrinking names.
Validation: inspector 1440/768/390 zero FAIL. Tiny-text warning retained only for 12px metadata/axis labels, competitors are 13px tree /14px list. No inspector allowances.
Validation: tournament tests 2/2 and scoped ESLint pass. Whole-project tsc blocked by unrelated LifeDomainDetails.tsx size="large" type error.
Data: uses existing API and typed local tournament sample; no demo values embedded in product components. Browser verification uses local mock, not live backend.
