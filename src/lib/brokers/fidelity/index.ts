// Barrel for the Fidelity broker. Bundles the positions / sales / transactions
// parsers under a single import surface. Future broker implementations
// (e.g. Morgan Stanley) will live in sibling folders with the same shape.

export { parseCsvFile, parseSalesCsvFile } from './positions-parser';
export {
  parseTransactionHistoryCsv,
  type DividendEvent,
  type CashInterestEvent,
  type TransactionHistoryParseResult,
} from './transactions-parser';
