/* Client view words. In Coach view a term is itself; in Client view it is the
   glossary's plain-English label. Metric names come only from metrics.json. */
export function translator(app) {
  const terms = (app.data && app.data.glossary && app.data.glossary.terms) || {};
  return function t(term) { return app.view === 'client' && terms[term] ? terms[term] : term; };
}
export function metricLabel(app, def) { return app.view === 'client' ? def.clientLabel : def.name; }
