// Roles that can see and operate the Finance module. Mirrors isFinance()
// in firestore.rules — keep the two in sync.
export const FINANCE_MODULE_ROLES = ["super_admin", "admin", "accountant"];

export const DEFAULT_ACCOUNTS = [
  { id: "cash", name: "Cash", type: "cash" },
  { id: "bank1", name: "Bank Account 1", type: "bank" },
  { id: "bank2", name: "Bank Account 2", type: "bank" },
];

// Editable by admins (stored on orgSettings/main.financeCategories); these
// are only the starting lists used until someone edits them.
export const DEFAULT_PROJECT_EXPENSE_CATEGORIES = [
  "Food",
  "Travel",
  "Hotel",
  "Freelancer",
  "Petrol",
  "Production",
  "Equipment",
  "Printing",
  "Props",
  "Parking",
  "Miscellaneous",
];

export const DEFAULT_COMPANY_EXPENSE_CATEGORIES = [
  "Office Rent",
  "Electricity",
  "Internet",
  "Software",
  "Marketing",
  "CA",
  "Office Expenses",
  "Equipment Purchase",
  "Maintenance",
];

export const DEFAULT_INCOME_CATEGORIES = ["Project Payment", "Other Income"];

// System categories written by the payroll / loan flows. Not editable, so
// the P&L can always find them.
export const CAT_SALARY = "Salary";
export const CAT_EMI = "Loan EMI";
export const CAT_ADVANCE = "Advance";
export const CAT_ADVANCE_RETURN = "Advance Return";
export const CAT_LOAN_RECEIPT = "Loan Received";
export const CAT_TRANSFER = "Transfer";
export const CAT_PROJECT_PAYMENT = "Project Payment";

// Transaction kinds.
//  income          money in                       (P&L revenue)
//  expense         money out                      (P&L expense)
//  transfer        account -> account             (balances only)
//  advance         allowance / salary advance out (balances only, recoverable)
//  advance_return  unspent allowance back in      (balances only)
//  loan_in         company loan disbursement in   (balances only, liability)
export const TX_KINDS = ["income", "expense", "transfer", "advance", "advance_return", "loan_in"];

export const KIND_LABELS = {
  income: "Income",
  expense: "Expense",
  transfer: "Transfer",
  advance: "Advance given",
  advance_return: "Advance returned",
  loan_in: "Loan received",
};

// Company P&L buckets for company-scope expenses.
export const OFFICE_CATEGORIES = ["Office Rent", "Electricity", "Internet", "Office Expenses", "Maintenance", "CA"];
export const MARKETING_CATEGORIES = ["Marketing"];
export const SOFTWARE_CATEGORIES = ["Software"];

export const DEFAULT_ANNUAL_PAID_LEAVES = 24;
export const INCREMENT_REMINDER_DAYS = 30;
export const EMI_REMINDER_DAYS = 7;
