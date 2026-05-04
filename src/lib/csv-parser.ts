// Re-export shim. The actual implementation now lives under
// `lib/brokers/fidelity/positions-parser.ts`. This shim is kept so existing
// callers (App.tsx, CsvImporter, tests) continue to work without churn.
// New code should import from `lib/brokers/fidelity` instead.

export { parseCsvFile, parseSalesCsvFile } from './brokers/fidelity/positions-parser';
