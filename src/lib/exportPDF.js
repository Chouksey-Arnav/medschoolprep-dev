// ─────────────────────────────────────────────────────────────────────────────
// PDF exports — the lazy front door.
//
// The renderers themselves are unchanged and live in ./exportPDF.impl.js. This
// file exists only to keep them, and jsPDF underneath them, out of the boot
// bundle.
//
// The problem it solves: jsPDF and its html2canvas dependency are ~750 kB raw
// (~220 kB gzipped, spread across the `utils`, `index.es` and `html2canvas`
// chunks), and because the six renderers below were imported statically from
// App.jsx, ActivitiesResumePanel, FourYearExport and AdmissionCalculatorPanel,
// every one of those bytes was in the module graph of the first page paint.
// Every student on every visit downloaded a PDF engine, and the overwhelming
// majority of them never export a PDF at all. Those who do are pressing a button
// and already expect a moment's work.
//
// So each export is now an async façade over a dynamic import(). Rollup splits
// the implementation into its own chunk on the strength of that import alone, and
// the chunk is fetched the first time somebody actually asks for a document — and
// then cached by the service worker's `app-assets` rule, so it is fetched once
// ever, not once per export.
//
// The API is deliberately unchanged apart from being promise-returning. Call
// sites are all click handlers that ignore the return value, so most needed no
// edit; anything that inspects the returned jsPDF document (scripts/
// verifyPortfolioExport.mjs) awaits it.
// ─────────────────────────────────────────────────────────────────────────────

// One import() for all six. They share the whole renderer module — fonts, color
// tables, the page furniture — so splitting them apart would mean shipping six
// chunks that each pull in the same jsPDF anyway.
const impl = () => import('./exportPDF.impl.js');

export const exportQuizResult = async (...args) => (await impl()).exportQuizResult(...args);
export const exportAdmissionEstimates = async (...args) => (await impl()).exportAdmissionEstimates(...args);
export const exportPortfolioResume = async (...args) => (await impl()).exportPortfolioResume(...args);
export const exportPortfolioDossier = async (...args) => (await impl()).exportPortfolioDossier(...args);
export const exportPathwayCertificate = async (...args) => (await impl()).exportPathwayCertificate(...args);
export const exportFlashDeck = async (...args) => (await impl()).exportFlashDeck(...args);
