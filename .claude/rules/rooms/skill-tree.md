---
paths:
  - "rooms/skill-tree.html"
  - "engines/skilltree.js"
---
# The Skill Tree (`skill-tree`)
File: rooms/skill-tree.html · 609 lines
Engines: projection, tier0, foo, skilltree
Reference data: exercises.json, foo_rules.json, skill_links.json, skill_tree.json
Owns: skillsDone
Reads from other owners: grossAnnualIncome (start), monthsClosed (budget), monthlyExpenses (expenses), exercisesDone (exercises), practiceLedger (stacker)
Latest decisions:
  - D-141 — The card says what the curriculum says
  - D-140 — The board, redrawn as a tech tree
  - D-139 — The Skill Tree gets its real curriculum: 625 skills, 25 trees, 312 lanes
  - D-131 — The Skill Tree and the Exercise Library, as rooms: two ladders, one game
Full context: node tools/context/pack.js skill-tree
