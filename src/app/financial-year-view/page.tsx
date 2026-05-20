"use client";
import { useAuth } from "../../context/AuthContext";
import ProtectedRoute from "../../components/ProtectedRoute";
import { useEffect, useState } from "react";
import { getUserDoc } from "../../utils/getUserDoc";
import { useRouter } from "next/navigation";
import { db } from "../../firebase/config";
import { ref, get } from "firebase/database";
import { dbPath, DB_PATHS, ROUTES, hasAccess, YEAR_KEY_REGEX, formatFinancialYear, getCurrentYearString } from "../../utils/constants";

interface SectionState {
  expanded: boolean;
  data: any[];
  loading: boolean;
}

type RecordType = 'Income' | 'Expense' | 'Members';

export default function FinancialYearViewPage() {
  const { user } = useAuth();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(getCurrentYearString());
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [yearsLoading, setYearsLoading] = useState(true);
  const router = useRouter();

  // Section states for expandable data views
  const [incomeState, setIncomeState] = useState<SectionState>({ expanded: false, data: [], loading: false });
  const [expenseState, setExpenseState] = useState<SectionState>({ expanded: false, data: [], loading: false });
  const [membersState, setMembersState] = useState<SectionState>({ expanded: false, data: [], loading: false });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      getUserDoc(user.uid)
        .then((data) => {
          setUserData(data);
        })
        .finally(() => setLoading(false));
    }
  }, [user]);

  // Discover available financial years from the database
  useEffect(() => {
    const discoverYears = async () => {
      try {
        setYearsLoading(true);
        // Read the Accounts level to discover available year nodes
        const snapshot = await get(ref(db, DB_PATHS.ROOT));
        if (snapshot.exists()) {
          const data = snapshot.val();
          // Filter to only include 4-digit numeric year keys (e.g., "2024", "2025")
          const years = Object.keys(data)
            .filter(key => YEAR_KEY_REGEX.test(key))
            .sort((a, b) => parseInt(b) - parseInt(a));
          setAvailableYears(years);
          if (years.length > 0 && !years.includes(selectedYear)) {
            setSelectedYear(years[0]);
          }
        }
      } catch (err) {
        console.error("Error discovering years:", err);
        setAvailableYears([selectedYear]);
      } finally {
        setYearsLoading(false);
      }
    };
    discoverYears();
  }, []);

  // Fetch data for a specific section when expanded
  const fetchSectionData = async (type: RecordType) => {
    const stateSetterMap: Record<RecordType, React.Dispatch<React.SetStateAction<SectionState>>> = {
      Income: setIncomeState,
      Expense: setExpenseState,
      Members: setMembersState,
    };

    stateSetterMap[type](prev => ({ ...prev, loading: true, expanded: true }));

    try {
      const sectionRef = ref(db, `${dbPath.year(selectedYear)}/${type}`);
      const snapshot = await get(sectionRef);

      if (snapshot.exists()) {
        const data = snapshot.val();
        const list: any[] = Object.keys(data).map((key) => ({
          key,
          ...data[key],
        }));

        // Sort by date if available, otherwise by key
        list.sort((a, b) => {
          const dateA = a.date ? new Date(a.date).getTime() : 0;
          const dateB = b.date ? new Date(b.date).getTime() : 0;
          if (dateA && dateB) return dateB - dateA;
          return b.key?.localeCompare(a.key) || 0;
        });

        stateSetterMap[type]({ data: list, expanded: true, loading: false });
      } else {
        stateSetterMap[type]({ data: [], expanded: true, loading: false });
      }
    } catch (err) {
      console.error(`Error fetching ${type}:`, err);
      stateSetterMap[type]({ data: [], expanded: true, loading: false });
      setError(`Failed to load ${type} data.`);
    }
  };

  // Toggle section expansion
  const toggleSection = (type: RecordType) => {
    const stateMap: Record<RecordType, SectionState> = {
      Income: incomeState,
      Expense: expenseState,
      Members: membersState,
    };
    const stateSetterMap: Record<RecordType, React.Dispatch<React.SetStateAction<SectionState>>> = {
      Income: setIncomeState,
      Expense: setExpenseState,
      Members: setMembersState,
    };

    if (stateMap[type].expanded) {
      // Collapse
      stateSetterMap[type]({ data: [], expanded: false, loading: false });
    } else {
      // Expand and fetch
      fetchSectionData(type);
    }
  };

  // Handle year change
  const handleYearChange = (year: string) => {
    setSelectedYear(year);
    // Reset all sections
    setIncomeState({ expanded: false, data: [], loading: false });
    setExpenseState({ expanded: false, data: [], loading: false });
    setMembersState({ expanded: false, data: [], loading: false });
    setError(null);
  };

  // Generate all keys/columns present in a dataset (for dynamic table display)
  const getAllKeys = (data: any[]): string[] => {
    const keySet = new Set<string>();
    data.forEach(item => {
      Object.keys(item).forEach(k => {
        if (k !== 'key') keySet.add(k);
      });
    });
    // Priority ordering for common fields
    const priorityOrder = ['date', 'receiptNumber', 'billNumber', 'memberId', 'name', 'amount', 'category', 'paymentStatus', 'mobileNumber', 'panNumber'];
    const prioritized: string[] = [];
    const remaining: string[] = [];
    
    keySet.forEach(k => {
      if (priorityOrder.includes(k)) {
        prioritized.push(k);
      } else {
        remaining.push(k);
      }
    });
    
    prioritized.sort((a, b) => priorityOrder.indexOf(a) - priorityOrder.indexOf(b));
    remaining.sort();
    
    return [...prioritized, ...remaining];
  };

  // Format a cell value for display
  const formatCellValue = (value: any, key: string): string => {
    if (value === null || value === undefined || value === '') return '-';
    if (key === 'date' && value) {
      try {
        return new Date(value).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        });
      } catch { return value; }
    }
    if (key === 'amount' || key === 'total_expense' || key === 'total_income') {
      const num = typeof value === 'string' ? parseFloat(value) : value;
      if (!isNaN(num)) {
        return `₹ ${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
    }
    if (key === 'paymentStatus') {
      return value ? 'Paid' : 'Pending';
    }
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  // Get display label for a key
  const getLabel = (key: string): string => {
    const labels: Record<string, string> = {
      date: 'Date',
      receiptNumber: 'Receipt No.',
      billNumber: 'Bill No.',
      memberId: 'Member ID',
      name: 'Name',
      amount: 'Amount',
      category: 'Category',
      paymentStatus: 'Status',
      mobileNumber: 'Mobile',
      panNumber: 'PAN',
      secondaryMemberName: 'Secondary Member',
      address: 'Address',
      emailId: 'Email',
      modeOfPayment: 'Payment Mode',
      chequeNumber: 'Cheque/Ref No.',
      inputBy: 'Input By',
      createdBy: 'Created By',
      createdAt: 'Created At',
    };
    return labels[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
  };

  // Check permissions
  const canAccess = userData && hasAccess(userData.userType);

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div>Loading...</div>
        </div>
      </ProtectedRoute>
    );
  }

  if (!canAccess) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 py-8 px-4">
          <div className="max-w-4xl mx-auto">
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
              <p className="font-medium">Access Denied</p>
              <p className="text-sm">You do not have permission to view this page.</p>
            </div>
            <button
              onClick={() => router.push(ROUTES.DASHBOARD)}
              className="mt-4 text-blue-600 hover:text-blue-800"
            >
              ← Back to Dashboard
            </button>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center mb-6">
            <button
              onClick={() => router.push(ROUTES.DASHBOARD)}
              className="mr-4 text-blue-600 hover:text-blue-800"
            >
              ← Back to Dashboard
            </button>
            <h1 className="text-3xl font-bold text-gray-800">Financial Year View</h1>
          </div>

          {/* Year Selector */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <label htmlFor="financial-year" className="text-lg font-semibold text-gray-700 whitespace-nowrap">
                Select Financial Year:
              </label>
              <select
                id="financial-year"
                value={selectedYear}
                onChange={(e) => handleYearChange(e.target.value)}
                className="w-full sm:w-64 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-800"
                disabled={yearsLoading}
              >
                {yearsLoading ? (
                  <option>Loading years...</option>
                ) : availableYears.length === 0 ? (
                  <option value={selectedYear}>{selectedYear}</option>
                ) : (
                  availableYears.map((year) => (
                    <option key={year} value={year}>
                      {formatFinancialYear(year)}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md mb-6">
              {error}
            </div>
          )}

          {/* Income Section */}
          <div className="bg-white rounded-lg shadow-md mb-6 overflow-hidden">
            <button
              onClick={() => toggleSection('Income')}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors duration-200 focus:outline-none"
            >
              <div className="flex items-center gap-3">
                <svg className={`w-5 h-5 text-blue-600 transition-transform duration-200 ${incomeState.expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <h2 className="text-xl font-semibold text-gray-800">Income</h2>
                {incomeState.data.length > 0 && incomeState.expanded && (
                  <span className="text-sm text-gray-500">({incomeState.data.length} records)</span>
                )}
              </div>
              {incomeState.expanded ? (
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </button>

            {incomeState.expanded && (
              <div className="border-t border-gray-200">
                {incomeState.loading ? (
                  <div className="p-6 text-center text-gray-500">Loading income data...</div>
                ) : incomeState.data.length === 0 ? (
                  <div className="p-6 text-center text-gray-500">No income records found for {selectedYear}.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          {getAllKeys(incomeState.data).filter(k => k !== 'key').slice(0, 8).map(key => (
                            <th key={key} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                              {getLabel(key)}
                            </th>
                          ))}
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {incomeState.data.map((item) => {
                          const keys = getAllKeys(incomeState.data).filter(k => k !== 'key').slice(0, 8);
                          return (
                            <tr
                              key={item.key}
                              className="hover:bg-gray-50 cursor-pointer"
                              onClick={() => router.push(`${ROUTES.INCOME_LIST}/${item.key}`)}
                            >
                              {keys.map(key => (
                                <td key={key} className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                  {formatCellValue(item[key], key)}
                                </td>
                              ))}
                              <td className="px-4 py-3 text-right">
                                <span className="text-blue-600 text-sm hover:text-blue-800">View →</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      {(() => {
                        const numericKeys = getAllKeys(incomeState.data).filter(k => k === 'amount' || k.toLowerCase().includes('amount') || k.toLowerCase().includes('total'));
                        if (numericKeys.length > 0) {
                          return (
                            <tfoot className="bg-gray-50">
                              <tr>
                                <td colSpan={8} className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                                  Total Records: {incomeState.data.length}
                                </td>
                              </tr>
                            </tfoot>
                          );
                        }
                      })()}
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Expense Section */}
          <div className="bg-white rounded-lg shadow-md mb-6 overflow-hidden">
            <button
              onClick={() => toggleSection('Expense')}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors duration-200 focus:outline-none"
            >
              <div className="flex items-center gap-3">
                <svg className={`w-5 h-5 text-red-600 transition-transform duration-200 ${expenseState.expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <h2 className="text-xl font-semibold text-gray-800">Expense</h2>
                {expenseState.data.length > 0 && expenseState.expanded && (
                  <span className="text-sm text-gray-500">({expenseState.data.length} records)</span>
                )}
              </div>
              {expenseState.expanded ? (
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </button>

            {expenseState.expanded && (
              <div className="border-t border-gray-200">
                {expenseState.loading ? (
                  <div className="p-6 text-center text-gray-500">Loading expense data...</div>
                ) : expenseState.data.length === 0 ? (
                  <div className="p-6 text-center text-gray-500">No expense records found for {selectedYear}.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          {getAllKeys(expenseState.data).filter(k => k !== 'key').slice(0, 8).map(key => (
                            <th key={key} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                              {getLabel(key)}
                            </th>
                          ))}
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {expenseState.data.map((item) => {
                          const keys = getAllKeys(expenseState.data).filter(k => k !== 'key').slice(0, 8);
                          return (
                            <tr
                              key={item.key}
                              className="hover:bg-gray-50 cursor-pointer"
                              onClick={() => router.push(`${ROUTES.EXPENSE_LIST}/${item.key}`)}
                            >
                              {keys.map(key => (
                                <td key={key} className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                  {formatCellValue(item[key], key)}
                                </td>
                              ))}
                              <td className="px-4 py-3 text-right">
                                <span className="text-blue-600 text-sm hover:text-blue-800">View →</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-gray-50">
                        <tr>
                          <td colSpan={8} className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                            Total Records: {expenseState.data.length}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Members Section */}
          <div className="bg-white rounded-lg shadow-md mb-6 overflow-hidden">
            <button
              onClick={() => toggleSection('Members')}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors duration-200 focus:outline-none"
            >
              <div className="flex items-center gap-3">
                <svg className={`w-5 h-5 text-purple-600 transition-transform duration-200 ${membersState.expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <h2 className="text-xl font-semibold text-gray-800">Members</h2>
                {membersState.data.length > 0 && membersState.expanded && (
                  <span className="text-sm text-gray-500">({membersState.data.length} members)</span>
                )}
              </div>
              {membersState.expanded ? (
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </button>

            {membersState.expanded && (
              <div className="border-t border-gray-200">
                {membersState.loading ? (
                  <div className="p-6 text-center text-gray-500">Loading member data...</div>
                ) : membersState.data.length === 0 ? (
                  <div className="p-6 text-center text-gray-500">No member records found for {selectedYear}.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          {getAllKeys(membersState.data).filter(k => k !== 'key').slice(0, 8).map(key => (
                            <th key={key} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                              {getLabel(key)}
                            </th>
                          ))}
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {membersState.data.map((item) => {
                          const keys = getAllKeys(membersState.data).filter(k => k !== 'key').slice(0, 8);
                          return (
                            <tr
                              key={item.key}
                              className="hover:bg-gray-50 cursor-pointer"
                              onClick={() => router.push(`${ROUTES.MEMBER_LIST}/${item.key}`)}
                            >
                              {keys.map(key => (
                                <td key={key} className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                  {formatCellValue(item[key], key)}
                                </td>
                              ))}
                              <td className="px-4 py-3 text-right">
                                <span className="text-blue-600 text-sm hover:text-blue-800">View →</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-gray-50">
                        <tr>
                          <td colSpan={8} className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                            Total Members: {membersState.data.length} | Paid: {membersState.data.filter((m: any) => m.paymentStatus).length} | Pending: {membersState.data.filter((m: any) => !m.paymentStatus).length}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick Summary Cards - always visible for the selected year */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-blue-800 uppercase tracking-wider">Income</h3>
              <p className="text-2xl font-bold text-blue-600 mt-1">
                {incomeState.data.length > 0 ? (
                  `₹ ${incomeState.data.reduce((sum: number, item: any) => {
                    const amt = item.amount ? (typeof item.amount === 'string' ? parseFloat(item.amount) : item.amount) : 0;
                    return sum + (isNaN(amt) ? 0 : amt);
                  }, 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                ) : '—'}
              </p>
              <p className="text-xs text-blue-600 mt-1">
                {incomeState.data.length > 0 ? `${incomeState.data.length} records` : 'Click above to load'}
              </p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-red-800 uppercase tracking-wider">Expense</h3>
              <p className="text-2xl font-bold text-red-600 mt-1">
                {expenseState.data.length > 0 ? (
                  `₹ ${expenseState.data.reduce((sum: number, item: any) => {
                    const amt = item.amount ? (typeof item.amount === 'string' ? parseFloat(item.amount) : item.amount) : 0;
                    return sum + (isNaN(amt) ? 0 : amt);
                  }, 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                ) : '—'}
              </p>
              <p className="text-xs text-red-600 mt-1">
                {expenseState.data.length > 0 ? `${expenseState.data.length} records` : 'Click above to load'}
              </p>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-purple-800 uppercase tracking-wider">Members</h3>
              <p className="text-2xl font-bold text-purple-600 mt-1">
                {membersState.data.length}
              </p>
              <p className="text-xs text-purple-600 mt-1">
                {membersState.data.length > 0 
                  ? `Paid: ${membersState.data.filter((m: any) => m.paymentStatus).length} / Pending: ${membersState.data.filter((m: any) => !m.paymentStatus).length}`
                  : 'Click above to load'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}