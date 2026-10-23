/* test/rooms/flow.js — the Sankey, drawn from the spine. D-128 (build 8). */
module.exports = function (t) {
  const { section, check, checkTrue, ROOT, fs, path } = t;
  const Charts = require(path.join(ROOT, 'shared/charts.js'));
  section('Where it flows (D-128): a Sankey from live entries');
  const svg = Charts.sankey({ nodes: [{ id: 'a', label: 'Pay', column: 0 }, { id: 'pool', label: 'Take-home', column: 1 }, { id: 'x', label: 'Expenses', column: 2 }, { id: 's', label: 'Savings', column: 2 }],
    links: [{ from: 'a', to: 'pool', value: 400000 }, { from: 'pool', to: 'x', value: 250000 }, { from: 'pool', to: 's', value: 50000 }] });
  check('four nodes drawn', (svg.match(/class="node"/g) || []).length, 4);
  check('three bands drawn', (svg.match(/class="flow"/g) || []).length, 3);
  checkTrue('each band names its ends and value', /Pay → Take-home: \$4,000/.test(svg) && /Take-home → Savings: \$500/.test(svg));
  checkTrue('an unlinked node is not drawn', !/Ghost/.test(Charts.sankey({ nodes: [{ id: 'a', label: 'A', column: 0 }, { id: 'b', label: 'B', column: 1 }, { id: 'g', label: 'Ghost', column: 1 }], links: [{ from: 'a', to: 'b', value: 1 }] })));
  checkTrue('nothing to draw says so', /Nothing flows yet/.test(Charts.sankey({ nodes: [], links: [] })));
  const page = fs.readFileSync(path.join(ROOT, 'rooms/cash-flow.html'), 'utf8');
  checkTrue('Cash Flow draws it from the ledger and the log on every render', /Ledger\.month\(h, TABLES, m\)/.test(page) && /CashFlow\.logInMonth\(/.test(page) && /Charts\.sankey\(/.test(page) && /renderFlow\(h\)/.test(page));
  checkTrue('and from no saved dataset', !/flowData|sankeyData|localStorage\.(get|set)Item/.test(page.replace(/<!--[\s\S]*?-->/g, '')));
};
