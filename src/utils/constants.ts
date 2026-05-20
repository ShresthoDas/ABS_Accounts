// ============================================================
// Centrally managed constants for ABS Accounts application
// ============================================================

// --------------- Database Paths ---------------
export const DB_PATHS = {
  // Base root
  ROOT: 'UAT/Accounts',

  // Section paths (use with year: `${DB_PATHS.ROOT}/${year}/Income`)
  INCOME: 'Income',
  EXPENSE: 'Expense',
  MEMBERS: 'Members',

  // Totals
  TOTAL_INCOME: 'total_income',
  TOTAL_EXPENSE: 'total_expense',

  // Counters
  RECEIPT_COUNTERS: 'ReceiptCounters',
  MEMBER_COUNTER: 'MemberCounter',
} as const;

// Helper to build full DB paths
export const dbPath = {
  /** e.g. dbPath.year("2024") => "UAT/Accounts/2024" */
  year: (year: string | number) => `${DB_PATHS.ROOT}/${year}`,
  
  /** e.g. dbPath.income("2024") => "UAT/Accounts/2024/Income" */
  income: (year: string | number) => `${DB_PATHS.ROOT}/${year}/${DB_PATHS.INCOME}`,
  
  /** e.g. dbPath.expense("2024") => "UAT/Accounts/2024/Expense" */
  expense: (year: string | number) => `${DB_PATHS.ROOT}/${year}/${DB_PATHS.EXPENSE}`,
  
  /** e.g. dbPath.members("2024") => "UAT/Accounts/2024/Members" */
  members: (year: string | number) => `${DB_PATHS.ROOT}/${year}/${DB_PATHS.MEMBERS}`,
  
  /** e.g. dbPath.totalIncome("2024") => "UAT/Accounts/2024/total_income" */
  totalIncome: (year: string | number) => `${DB_PATHS.ROOT}/${year}/${DB_PATHS.TOTAL_INCOME}`,
  
  /** e.g. dbPath.totalExpense("2024") => "UAT/Accounts/2024/total_expense" */
  totalExpense: (year: string | number) => `${DB_PATHS.ROOT}/${year}/${DB_PATHS.TOTAL_EXPENSE}`,
  
  /** e.g. dbPath.receiptCounter("24") => "UAT/Accounts/ReceiptCounters/24" */
  receiptCounter: (yearSuffix: string | number) => `${DB_PATHS.ROOT}/${DB_PATHS.RECEIPT_COUNTERS}/${yearSuffix}`,
  
  /** dbPath.memberCounter => "UAT/Accounts/MemberCounter" */
  memberCounter: `${DB_PATHS.ROOT}/${DB_PATHS.MEMBER_COUNTER}`,
};

// --------------- App Route Paths ---------------
export const ROUTES = {
  DASHBOARD: '/dashboard',
  EXPENSE_TRACKER: '/expense-tracker',
  EXPENSE_LIST: '/expense-list',
  INCOME_TRACKER: '/income-tracker',
  INCOME_LIST: '/income-list',
  ADD_MEMBER: '/add-member',
  MEMBER_LIST: '/member-list',
  FINANCIAL_YEAR_VIEW: '/financial-year-view',
  LOGIN: '/login',
} as const;

// --------------- User Types (permissions) ---------------
export const USER_TYPES = {
  ACCOUNTS: 'Accounts',
  GB: 'GB',
} as const;

export const ALLOWED_USER_TYPES = [USER_TYPES.ACCOUNTS, USER_TYPES.GB] as const;

// Helper to check if a user type has access
export const hasAccess = (userType: string | undefined | null): boolean => {
  return ALLOWED_USER_TYPES.includes(userType as typeof ALLOWED_USER_TYPES[number]);
};

// --------------- Payment Modes ---------------
export const PAYMENT_MODES = {
  CASH: 'Cash' as const,
  CHEQUE: 'Cheque' as const,
  NEFT: 'NEFT' as const,
} as const;

export const ALL_PAYMENT_MODES = [PAYMENT_MODES.CASH, PAYMENT_MODES.CHEQUE, PAYMENT_MODES.NEFT] as const;

export type PaymentMode = typeof ALL_PAYMENT_MODES[number];

// Helper to check if cheque/reference number is needed
export const requiresReferenceNumber = (mode: string): boolean => {
  return mode === PAYMENT_MODES.CHEQUE || mode === PAYMENT_MODES.NEFT;
};

// --------------- Category Options ---------------
export const INCOME_CATEGORIES = [
  { value: 'Donation', label: 'Donation' },
  { value: 'Membership Fee', label: 'Membership Fee' },
  { value: 'Event Income', label: 'Event Income' },
  { value: 'Interest Income', label: 'Interest Income' },
  { value: 'Rental Income', label: 'Rental Income' },
  { value: 'Grant', label: 'Grant' },
  { value: 'Sponsorship', label: 'Sponsorship' },
  { value: 'Sale Proceeds', label: 'Sale Proceeds' },
  { value: 'Refund Received', label: 'Refund Received' },
  { value: 'Other Income', label: 'Other Income' },
] as const;

export const EXPENSE_CATEGORIES = [
  { value: 'Office Supplies', label: 'Office Supplies' },
  { value: 'Travel', label: 'Travel' },
  { value: 'Food & Beverages', label: 'Food & Beverages' },
  { value: 'Utilities', label: 'Utilities' },
  { value: 'Maintenance', label: 'Maintenance' },
  { value: 'Marketing', label: 'Marketing' },
  { value: 'Professional Services', label: 'Professional Services' },
  { value: 'Rent', label: 'Rent' },
  { value: 'Insurance', label: 'Insurance' },
  { value: 'Other', label: 'Other' },
] as const;

// --------------- Default Values ---------------
export const DEFAULTS = {
  MEMBER_AMOUNT: '8000',
  MEMBER_ID_PREFIX: 'ABSPM-',
  RECEIPT_PREFIX: 'ABS',
} as const;

// --------------- Year Regex (for filtering DB keys) ---------------
export const YEAR_KEY_REGEX = /^\d{4}$/;

// --------------- Financial Year Label ---------------
export const formatFinancialYear = (year: string): string => {
  return `${year} - ${parseInt(year) + 1}`;
};

// --------------- Current Year Helper ---------------
export const getCurrentYearString = (): string => new Date().getFullYear().toString();
export const getCurrentYearShort = (): string => getCurrentYearString().slice(-2);