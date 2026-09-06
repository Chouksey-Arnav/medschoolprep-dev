// The Common Application layer, in one import.
//
//   ./sections.js — what the real form is: its sections, its fields, its real
//                   limits, and which Portfolio surface feeds each one.
//   ./derive.js   — what would go in those sections for this student right now,
//                   derived from their Portfolio and never invented.
//   ./sync.js     — the ledger between the two copies of the truth, since the
//                   Common Application has no API and never will.
//
// The activity/honor export engine that predates all three is ./activities.js.
// It moved here from src/lib/commonApp.js when this directory was created, for
// a boring but real reason: a file and a directory with the same name are an
// ambiguous import, and the one thing this layer cannot afford is two modules
// that both answer to `lib/commonApp`. The other three import it rather than
// duplicating it — it already models the ten activity slots correctly and there
// is no second version of it.
export * from './activities.js';
export * from './sections.js';
export * from './derive.js';
export * from './sync.js';
