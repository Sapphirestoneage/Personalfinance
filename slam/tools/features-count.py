# Recount the FEATURES.md summary from its cells (overnight Track L): python3 tools/features-count.py [--write]
import re, sys
p = 'docs/FEATURES.md'; s = open(p).read()
cols = ['Entry points', 'Views', 'States', 'Actions', 'Math', 'Tests']
count = {c: {'done': 0, 'partial': 0, 'missing': 0, 'n/a': 0} for c in cols}
rows = 0; sec = ''
for line in s.split('\n'):
    if line.startswith('## '): sec = line
    if 'Builder' in sec or 'Summary' in sec: continue
    if not line.startswith('| ') or line.startswith('| Feature') or line.startswith('|---'): continue
    cells = [c.strip() for c in line.strip().strip('|').split('|')]
    if len(cells) < 7: continue
    rows += 1
    for c, v in zip(cols, cells[1:7]):
        k = 'n/a' if v.startswith('n/a') else v.split(':')[0].split(' ')[0]
        if k in count[c]: count[c][k] += 1
tot = {k: sum(count[c][k] for c in cols) for k in ['done', 'partial', 'missing', 'n/a']}
table = '| Column | Done | Partial | Missing | n/a |\n|---|---|---|---|---|\n' + '\n'.join('| %s | %d | %d | %d | %d |' % (c, count[c]['done'], count[c]['partial'], count[c]['missing'], count[c]['n/a']) for c in cols) + '\n| **All cells** | **%d** | **%d** | **%d** | **%d** |' % (tot['done'], tot['partial'], tot['missing'], tot['n/a'])
print(rows, 'rows'); print(table)
if '--write' in sys.argv:
    s = re.sub(r'\| Column \| Done \| Partial \| Missing \| n/a \|\n(\|.*\|\n)+', table + '\n', s, count=1)
    s = re.sub(r'\n\d+ feature rows \(', '\n%d feature rows (' % rows, s, count=1)
    open(p, 'w').write(s)
