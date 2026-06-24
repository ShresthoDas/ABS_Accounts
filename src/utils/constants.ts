// ============================================================
// Centrally managed constants for ABS Accounts application
// ============================================================

// --------------- Database Paths ---------------
export const DB_PATHS = {
  // Base root
  ROOT: 'PROD/Accounts',

  // Section paths (use with year: `${DB_PATHS.ROOT}/${year}/Income`)
  INCOME: 'Income',
  EXPENSE: 'Expense',
  MEMBERS: 'Members',
  STALLS: 'Stalls',
  DONATIONS: 'Donations',
  SPOT_COLLECTION: 'SpotCollection',
  ADS: 'Ads',
  UNAUTH_QUEUE: 'UnauthQueue',

  // Projected Budgets
  PROJECTED_INCOME: 'ProjectedIncome',
  PROJECTED_EXPENSE: 'ProjectedExpense',

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
  
  /** e.g. dbPath.stalls("2024") => "UAT/Accounts/2024/Stalls" */
  stalls: (year: string | number) => `${DB_PATHS.ROOT}/${year}/${DB_PATHS.STALLS}`,
  
  /** e.g. dbPath.donations("2024") => "UAT/Accounts/2024/Donations" */
  donations: (year: string | number) => `${DB_PATHS.ROOT}/${year}/${DB_PATHS.DONATIONS}`,
  
  /** e.g. dbPath.ads("2024") => "UAT/Accounts/2024/Ads" */
  ads: (year: string | number) => `${DB_PATHS.ROOT}/${year}/${DB_PATHS.ADS}`,
  
  /** e.g. dbPath.spotCollection("2024") => "UAT/Accounts/2024/SpotCollection" */
  spotCollection: (year: string | number) => `${DB_PATHS.ROOT}/${year}/${DB_PATHS.SPOT_COLLECTION}`,
  
  /** e.g. dbPath.projectedIncome("2024") => "UAT/Accounts/2024/ProjectedIncome" */
  projectedIncome: (year: string | number) => `${DB_PATHS.ROOT}/${year}/${DB_PATHS.PROJECTED_INCOME}`,
  
  /** e.g. dbPath.projectedExpense("2024") => "UAT/Accounts/2024/ProjectedExpense" */
  projectedExpense: (year: string | number) => `${DB_PATHS.ROOT}/${year}/${DB_PATHS.PROJECTED_EXPENSE}`,
  
  /** dbPath.memberCounter => "UAT/Accounts/MemberCounter" */
  memberCounter: `${DB_PATHS.ROOT}/${DB_PATHS.MEMBER_COUNTER}`,
  unAuthQueue: `${DB_PATHS.ROOT}/${DB_PATHS.UNAUTH_QUEUE}`,
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
  STALL_TRACKER: '/stall-tracker',
  STALL_LIST: '/stall-list',
  DONATION_TRACKER: '/donation-tracker',
  DONATION_LIST: '/donation-list',
  AD_TRACKER: '/ad-tracker',
  AD_LIST: '/ad-list',
  SPOT_COLLECTION_TRACKER: '/spot-collection-tracker',
  SPOT_COLLECTION_LIST: '/spot-collection-list',
  PROJECTED_INCOME: '/projected-income',
  PROJECTED_EXPENSE: '/projected-expense',
  LOGIN: '/login',
  SIGN_UP: '/sign-up',
  UNAUTH_QUEUE: '/unauth-queue',
  USER_MANAGEMENT: '/user-management',
  REPORTS: '/reports',
} as const;

// --------------- User Types (permissions) ---------------
export const USER_TYPES = {
  ACCOUNTS: 'Accounts',
  GB: 'GB',
  FRONT_OFFICE: 'Front Office',
  MEMBER: 'Member',
} as const;

export const ALLOWED_USER_TYPES = [USER_TYPES.ACCOUNTS, USER_TYPES.GB] as const;

export const ALL_ADMIN_USER_TYPE_OPTIONS = [
  { value: 'GB', label: 'GB' },
  { value: 'Accounts', label: 'Accounts' },
  { value: 'Front Office', label: 'Front Office' },
  { value: 'Member', label: 'Member' },
] as const;

export const ALL_SIGNUP_USER_TYPE_OPTIONS = [
  { value: 'GB', label: 'GB' },
  { value: 'Accounts', label: 'Accounts' },
  { value: 'Front Office', label: 'Front Office' },
  { value: 'Member', label: 'Member' },
  { value: 'New Member', label: 'New Member' },
] as const;

// Helper to check if a user type has access (GB or Accounts)
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
  { value: 'Advertisement', label: 'Advertisement' },
  { value: 'Membership Fee', label: 'Membership Fee' },
  { value: 'Corporate Donations', label: 'Corporate Donations' },
  { value: 'Donation Item', label: 'Donation Item' },
  { value: 'Spot Collection', label: 'Spot Collection' },
  { value: 'Dan Peti', label: 'Dan Peti' },
  { value: 'Stall Booking', label: 'Stall Booking' },
  { value: 'Picnic', label: 'Picnic' },
  { value: 'Bijoya Sommeloni', label: 'Bijoya Sommeloni' },
  { value: 'Dandiya Ticket', label: 'Dandiya Ticket' },
] as const;

export const EXPENSE_CATEGORIES = [
  { value: 'Venue Rent', label: 'Venue Rent' },
  { value: 'Pandal/Theme', label: 'Pandal/Theme' },
  { value: 'Protima', label: 'Protima' },
  { value: 'Cultural - Artist', label: 'Cultural - Artist' },
  { value: 'Cultural- Sound/Light/inhouse', label: 'Cultural- Sound/Light/inhouse' },
  { value: 'Mahabhog', label: 'Mahabhog' },
  { value: 'Cook', label: 'Cook' },
  { value: 'Chur Churi', label: 'Chur Churi' },
  { value: 'Dhaaki', label: 'Dhaaki' },
  { value: 'Purohit', label: 'Purohit' },
  { value: 'Pujo', label: 'Pujo' },
  { value: 'Accomodation', label: 'Accomodation' },
  { value: 'Decoration', label: 'Decoration' },
  { value: 'Security', label: 'Security' },
  { value: 'Housekeeping', label: 'Housekeeping' },
  { value: 'Guest Felicitation', label: 'Guest Felicitation' },
  { value: 'Transport', label: 'Transport' },
  { value: 'Banner', label: 'Banner' },
  { value: 'Guest Refreshments', label: 'Guest Refreshments' },
  { value: 'Dashami Dinner', label: 'Dashami Dinner' },
  { value: 'Toilet', label: 'Toilet' },
  { value: 'Photography', label: 'Photography' },
  { value: 'Bijoya Sommeloni', label: 'Bijoya Sommeloni' },
  { value: 'Lokkhi Pujo', label: 'Lokkhi Pujo' },
  { value: 'Kali Pujo', label: 'Kali Pujo' },
  { value: 'Picnic', label: 'Picnic' },
  { value: 'Saraswati Pujo', label: 'Saraswati Pujo' },
  { value: 'CSR', label: 'CSR' },
  { value: 'Insurance', label: 'Insurance' },
  { value: 'CCTV', label: 'CCTV' },
  { value: 'Advertisement/Marketing', label: 'Advertisement/Marketing' },
  { value: 'Accounting Expense', label: 'Accounting Expense' },
  { value: 'Electricty', label: 'Electricty' },
  { value: 'Laptop', label: 'Laptop' },
  { value: 'Miscellaneous', label: 'Miscellaneous' },
  { value: 'Reimbursement', label: 'Reimbursement' },
  { value: 'Cash Withdrawal', label: 'Cash Withdrawal' },
] as const;

// --------------- Stall Types ---------------
export const STALL_TYPES = [
  { value: 'Food', label: 'Food' },
  { value: 'Dry', label: 'Dry' },
] as const;

export type StallType = typeof STALL_TYPES[number]['value'];

// --------------- Ad Types ---------------
export const AD_TYPES = [
  { value: 'Banner', label: 'Banner' },
  { value: 'LED', label: 'LED' },
] as const;

export type AdType = typeof AD_TYPES[number]['value'];

// --------------- Donation Event Categories ---------------
export const DONATION_EVENT_CATEGORIES = [
  { value: 'Durga Protima', label: 'Durga Protima' },
  { value: 'Dhaki', label: 'Dhaki' },
  { value: 'Purohit', label: 'Purohit' },
  { value: 'Mohila Dhaki', label: 'Mohila Dhaki' },
  { value: 'Durga Saree', label: 'Durga Saree' },
  { value: 'Shasti Pujo', label: 'Shasti Pujo' },
  { value: 'Sashti Pujo Flowers', label: 'Sashti Pujo Flowers' },
  { value: 'Sashti Pujo Sweets', label: 'Sashti Pujo Sweets' },
  { value: 'Saptami Pujo', label: 'Saptami Pujo' },
  { value: 'Saptami Flowers', label: 'Saptami Flowers' },
  { value: 'Saptami Mahabhog', label: 'Saptami Mahabhog' },
  { value: 'Saptami Pujo Prasad', label: 'Saptami Pujo Prasad' },
  { value: 'Saptami Pujo Sweets', label: 'Saptami Pujo Sweets' },
  { value: 'Saptami Pujo Bhog', label: 'Saptami Pujo Bhog' },
  { value: 'Bolidaan', label: 'Bolidaan' },
  { value: 'Ashtami Pujo', label: 'Ashtami Pujo' },
  { value: 'Ashtami Flowers', label: 'Ashtami Flowers' },
  { value: 'Ashtami Mahabhog', label: 'Ashtami Mahabhog' },
  { value: 'Ashtami Prasad', label: 'Ashtami Prasad' },
  { value: 'Ashtami Puja Bhog', label: 'Ashtami Puja Bhog' },
  { value: 'Ashtami Sweets', label: 'Ashtami Sweets' },
  { value: 'Poddo Ful', label: 'Poddo Ful' },
  { value: 'Shandhi Pujo', label: 'Shandhi Pujo' },
  { value: 'Kumari Pujo', label: 'Kumari Pujo' },
  { value: 'Navami Pujo', label: 'Navami Pujo' },
  { value: 'Navami Flowers', label: 'Navami Flowers' },
  { value: 'Navami Mahabhog', label: 'Navami Mahabhog' },
  { value: 'Navami Prasad', label: 'Navami Prasad' },
  { value: 'Navami Pujo Bhog', label: 'Navami Pujo Bhog' },
  { value: 'Navami Sweets', label: 'Navami Sweets' },
  { value: 'Durga Joggo', label: 'Durga Joggo' },
  { value: 'Dashami Sweets', label: 'Dashami Sweets' },
  { value: 'Lokkhi Protima', label: 'Lokkhi Protima' },
  { value: 'Lokkhi Pujo', label: 'Lokkhi Pujo' },
  { value: 'Lokkhi Flowers', label: 'Lokkhi Flowers' },
  { value: 'Lakkhi Bhog', label: 'Lakkhi Bhog' },
  { value: 'Lokkhi Pujo Saree', label: 'Lokkhi Pujo Saree' },
  { value: 'Lokkhi Pujo Mahabhog', label: 'Lokkhi Pujo Mahabhog' },
  { value: 'Lokkhi Pujo Prasad', label: 'Lokkhi Pujo Prasad' },
  { value: 'Lokkhi Pujo Sweets', label: 'Lokkhi Pujo Sweets' },
  { value: 'Kali Protima', label: 'Kali Protima' },
  { value: 'Kali Pujo', label: 'Kali Pujo' },
  { value: 'Kali Flowers', label: 'Kali Flowers' },
  { value: 'Kali Bhog', label: 'Kali Bhog' },
  { value: 'Kali Saree', label: 'Kali Saree' },
  { value: 'Kali MahaBhog', label: 'Kali MahaBhog' },
  { value: 'Kali Prasad', label: 'Kali Prasad' },
  { value: 'Kali Sweets', label: 'Kali Sweets' },
  { value: 'Saraswati Protima', label: 'Saraswati Protima' },
  { value: 'Saraswati Pujo', label: 'Saraswati Pujo' },
  { value: 'Saraswati Flowers', label: 'Saraswati Flowers' },
  { value: 'Saraswati Bhog', label: 'Saraswati Bhog' },
  { value: 'Saraswati Saree', label: 'Saraswati Saree' },
  { value: 'Saraswati MahaBhog', label: 'Saraswati MahaBhog' },
  { value: 'Saraswati Prasad', label: 'Saraswati Prasad' },
  { value: 'Saraswati Sweets', label: 'Saraswati Sweets' },
] as const;

// --------------- Default Values ---------------
export const DEFAULTS = {
  MEMBER_AMOUNT: "8000",
  MEMBER_ID_PREFIX: 'ABSPM-',
  RECEIPT_PREFIX: 'ABS',
  STALL_NUMBER_DEFAULT: 0,
  STALL_INCOME_CATEGORY: 'Stall Booking',
  DONATION_INCOME_CATEGORY: 'Donation Item',
  AD_INCOME_CATEGORY: 'Advertisement',
  MEMBERSHIP_INCOME_CATEGORY: 'Membership Fee',
  SPOT_COLLECTION_INCOME_CATEGORY: 'Spot Collection',
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