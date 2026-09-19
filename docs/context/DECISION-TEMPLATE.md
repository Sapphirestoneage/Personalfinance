## D-NNN — Short title, one line, in plain words

**Why.** One to three lines. The problem seen, by whom, in which room.

**Decision.** At most eight lines. Name the room ids and the files touched
(`rooms/<id>.html`, `engines/<name>.js`, `shared/<name>.js`). Say the rule,
not the reasoning; the reasoning goes in the commit message.

**Replaces or removes.** What screen, field, room or rule goes away because
of this. "Nothing" needs a reason while the freeze is on.

**Stored shape.** "No change", or the compatibility note: what changed in
`slaf.household.v2`, which rooms were updated, what a future reader must know.

**Verified.** The commands run: `node test/run.js`, `node test/forms.js`,
and the phone walk if the room takes typed input.
