import { accountEffects, round2 } from "./calc";

/** Account ledger: opening balance, then every movement with a running balance, oldest first. */
export function accountLedger(account, transactions) {
  const rows = [];
  transactions.forEach((tx) => {
    accountEffects(tx).forEach((e) => {
      if (e.accountId === account.id) rows.push({ tx, delta: e.delta });
    });
  });
  rows.sort((a, b) => (a.tx.date || "").localeCompare(b.tx.date || "") || (a.tx.createdAt || "").localeCompare(b.tx.createdAt || ""));
  let running = Number(account.openingBalance) || 0;
  return rows.map(({ tx, delta }) => {
    running = round2(running + delta);
    return { tx, delta, balance: running };
  });
}
