// The opportunity-intelligence layer, in one import.
//
// Surfaces import from here rather than reaching into the individual modules,
// so the internal split (schema / adapt / context / ranking / outcomes /
// feedback / discovery / store / insights) stays an implementation detail that
// can be rearranged without touching a component.
export * from './schema.js';
export * from './adapt.js';
export * from './context.js';
export * from './ranking.js';
export * from './outcomes.js';
export * from './feedback.js';
export * from './insights.js';
export * from './discovery.js';
export * from './store.js';
