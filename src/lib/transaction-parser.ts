// Re-export shim. The actual implementation now lives under
// `lib/brokers/fidelity/transactions-parser.ts`. This shim is kept so existing
// callers (App.tsx, components, storage, tests) continue to work without churn.
// New code should import from `lib/brokers/fidelity` instead.

export {
  parseTransactionHistoryCsv,
  type DividendEvent,
  type CashInterestEvent,
  type TransactionHistoryParseResult,
} from './brokers/fidelity/transactions-parser';
