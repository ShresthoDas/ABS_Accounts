"use client";
import { useAuth } from "../../context/AuthContext";
import ProtectedRoute from "../../components/ProtectedRoute";
import { useEffect, useState } from "react";
import { getUserDoc } from "../../utils/getUserDoc";
import { useRouter } from "next/navigation";
import { db } from "../../firebase/config";
import { ref, get } from "firebase/database";
import { dbPath, ROUTES, hasAccess } from "../../utils/constants";
import { useFinancialYear } from "../../context/FinancialYearContext";
import FinancialYearSelector from "../../components/FinancialYearSelector";
import StartNewFYButton from "../../components/StartNewFYButton";

// Feature group config
interface FeatureGroup {
  title: string;
  icon: React.ReactNode;
  color: string;
  items: { label: string; route: string; icon: React.ReactNode }[];
}

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const [userData, setUserData] = useState<any>(null);
  const { selectedYear } = useFinancialYear();
  const [totalExpense, setTotalExpense] = useState<number>(0);
  const [totalIncome, setTotalIncome] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const router = useRouter();

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      await logout();
      router.push("/login");
    } catch (error) {
      console.error("Error logging out:", error);
    } finally {
      setLoggingOut(false);
    }
  };

  useEffect(() => {
    if (user) {
      getUserDoc(user.uid)
        .then(data => setUserData(data))
        .finally(() => setLoading(false));
    }
  }, [user]);

  useEffect(() => {
    const fetchTotals = async () => {
      const currentYear = selectedYear;
      
      const totalExpenseRef = ref(db, dbPath.totalExpense(currentYear));
      const expenseSnapshot = await get(totalExpenseRef);
      if (expenseSnapshot.exists()) {
        setTotalExpense(expenseSnapshot.val() || 0);
      } else {
        setTotalExpense(0);
      }

      const totalIncomeRef = ref(db, dbPath.totalIncome(currentYear));
      const incomeSnapshot = await get(totalIncomeRef);
      if (incomeSnapshot.exists()) {
        setTotalIncome(incomeSnapshot.val() || 0);
      } else {
        setTotalIncome(0);
      }
    };

    if (userData) {
      fetchTotals();
    }
  }, [userData, selectedYear]);

  const canAccess = userData && hasAccess(userData.userType);

  // Reusable SVG icons
  const trackerIcon = (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
    </svg>
  );

  const listIcon = (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  );

  const financialYearIcon = (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );

  const userManagementIcon = (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );

  const featureGroups: FeatureGroup[] = [
    {
      title: "Income",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: "blue",
      items: [
        { label: "Add Income", route: ROUTES.INCOME_TRACKER, icon: trackerIcon },
        { label: "Income List", route: ROUTES.INCOME_LIST, icon: listIcon },
      ],
    },
    {
      title: "Expenses",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
      color: "green",
      items: [
        { label: "Add Expense", route: ROUTES.EXPENSE_TRACKER, icon: trackerIcon },
        { label: "Expense List", route: ROUTES.EXPENSE_LIST, icon: listIcon },
      ],
    },
    {
      title: "Members",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>
      ),
      color: "indigo",
      items: [
        { label: "Add Member", route: ROUTES.ADD_MEMBER, icon: trackerIcon },
        { label: "Member List", route: ROUTES.MEMBER_LIST, icon: listIcon },
      ],
    },
    {
      title: "Stall Bookings",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
      color: "orange",
      items: [
        { label: "New Stall Booking", route: ROUTES.STALL_TRACKER, icon: trackerIcon },
        { label: "Stall List", route: ROUTES.STALL_LIST, icon: listIcon },
      ],
    },
    {
      title: "Donations",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      ),
      color: "rose",
      items: [
        { label: "Add Donation", route: ROUTES.DONATION_TRACKER, icon: trackerIcon },
        { label: "Donation List", route: ROUTES.DONATION_LIST, icon: listIcon },
      ],
    },
    {
      title: "Budget Planning",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      color: "teal",
      items: [
        { label: "Projected Income", route: ROUTES.PROJECTED_INCOME, icon: trackerIcon },
        { label: "Projected Expense", route: ROUTES.PROJECTED_EXPENSE, icon: listIcon },
      ],
    },
    {
      title: "Spot Collection",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      color: "cyan",
      items: [
        { label: "New Collection", route: ROUTES.SPOT_COLLECTION_TRACKER, icon: trackerIcon },
        { label: "Collection List", route: ROUTES.SPOT_COLLECTION_LIST, icon: listIcon },
      ],
    },
    {
      title: "Advertisements",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
        </svg>
      ),
      color: "violet",
      items: [
        { label: "Ad Booking", route: ROUTES.AD_TRACKER, icon: trackerIcon },
        { label: "Ad List", route: ROUTES.AD_LIST, icon: listIcon },
      ],
    },
  ];

  const colorMap: Record<string, { bg: string; hover: string; ring: string; light: string }> = {
    blue: { bg: "bg-blue-600", hover: "hover:bg-blue-700", ring: "focus:ring-blue-500", light: "bg-blue-50" },
    green: { bg: "bg-green-600", hover: "hover:bg-green-700", ring: "focus:ring-green-500", light: "bg-green-50" },
    indigo: { bg: "bg-indigo-600", hover: "hover:bg-indigo-700", ring: "focus:ring-indigo-500", light: "bg-indigo-50" },
    orange: { bg: "bg-orange-600", hover: "hover:bg-orange-700", ring: "focus:ring-orange-500", light: "bg-orange-50" },
    rose: { bg: "bg-rose-600", hover: "hover:bg-rose-700", ring: "focus:ring-rose-500", light: "bg-rose-50" },
    violet: { bg: "bg-violet-600", hover: "hover:bg-violet-700", ring: "focus:ring-violet-500", light: "bg-violet-50" },
    cyan: { bg: "bg-cyan-600", hover: "hover:bg-cyan-700", ring: "focus:ring-cyan-500", light: "bg-cyan-50" },
    teal: { bg: "bg-teal-600", hover: "hover:bg-teal-700", ring: "focus:ring-teal-500", light: "bg-teal-50" },
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div>Loading...</div>
        </div>
      </ProtectedRoute>
    );
  }

  // Check if userType is "Front Office", "GB", or "Accounts"
  const isAuthorized = userData && (userData.userType === "Front Office" || userData.userType === "GB" || userData.userType === "Accounts");

  if (!isAuthorized) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Access Denied</h2>
            <p className="text-gray-600">You do not have permission to view this dashboard.</p>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 py-6 px-4">
        <div className="max-w-5xl mx-auto">
          {/* Top Bar with Financial Year Selector */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Always show FY selector for authorized users */}
              {userData && (userData.userType === "Front Office" || userData.userType === "GB" || userData.userType === "Accounts") && (
                <FinancialYearSelector />
              )}
              {canAccess && userData.userType !== "Front Office" && (
                <StartNewFYButton />
              )}
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 font-medium text-sm"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                {loggingOut ? "Logging out..." : "Logout"}
              </button>
            </div>
          </div>
          
          {userData ? (
            <div className="space-y-6">
              {/* Featured Actions for GB/Accounts */}
              {canAccess && userData.userType !== "Front Office" && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <button
                    onClick={() => router.push(ROUTES.FINANCIAL_YEAR_VIEW)}
                    className="w-full bg-gradient-to-r from-teal-500 to-teal-600 text-white rounded-lg shadow-md hover:from-teal-600 hover:to-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-400 transition-all duration-200 p-5 flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="bg-white/20 p-2.5 rounded-full">
                        {financialYearIcon}
                      </div>
                      <div className="text-left">
                        <p className="text-lg font-semibold">Financial Year View</p>
                        <p className="text-teal-100 text-sm">View complete yearly financial summary</p>
                      </div>
                    </div>
                    <div className="bg-white/20 p-2 rounded-full group-hover:bg-white/30 transition-colors">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                  <button
                    onClick={() => router.push(ROUTES.USER_MANAGEMENT)}
                    className="w-full bg-gradient-to-r from-indigo-500 to-indigo-600 text-white rounded-lg shadow-md hover:from-indigo-600 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all duration-200 p-5 flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="bg-white/20 p-2.5 rounded-full">
                        {userManagementIcon}
                      </div>
                      <div className="text-left">
                        <p className="text-lg font-semibold">User Management</p>
                        <p className="text-indigo-100 text-sm">Create users & reset passwords</p>
                      </div>
                    </div>
                    <div className="bg-white/20 p-2 rounded-full group-hover:bg-white/30 transition-colors">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                  <button
                    onClick={() => router.push(ROUTES.UNAUTH_QUEUE)}
                    className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-lg shadow-md hover:from-emerald-600 hover:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition-all duration-200 p-5 flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="bg-white/20 p-2.5 rounded-full">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                        </svg>
                      </div>
                      <div className="text-left">
                        <p className="text-lg font-semibold">Pending Approvals</p>
                        <p className="text-emerald-100 text-sm">Review pending signup/member requests</p>
                      </div>
                    </div>
                    <div className="bg-white/20 p-2 rounded-full group-hover:bg-white/30 transition-colors">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                </div>
              )}

              {/* Feature Group Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {featureGroups
                  .filter(group => userData.userType === "Front Office" ? ["Spot Collection", "Members"].includes(group.title) : true)
                  .map((group) => {
                    const colors = colorMap[group.color];
                    return (
                      <div key={group.title} className="bg-white rounded-lg shadow-md overflow-hidden">
                        {/* Card Header */}
                        <div className={`${colors.light} px-5 py-3.5 flex items-center gap-2.5 border-b border-gray-100`}>
                          <div className={`${colors.bg} text-white p-1.5 rounded-lg`}>
                            {group.icon}
                          </div>
                          <h2 className="text-base font-semibold text-gray-800">{group.title}</h2>
                        </div>
                        {/* Card Body with Action Buttons */}
                        <div className="p-4">
                          <div className="flex gap-3">
                            {group.items.map((item) => (
                              <button
                                key={item.label}
                                onClick={() => router.push(item.route)}
                                className={`flex-1 flex items-center justify-center gap-2 ${colors.bg} text-white px-4 py-2.5 rounded-md ${colors.hover} ${colors.ring} focus:outline-none focus:ring-2 font-medium text-sm transition-colors duration-200`}
                              >
                                {item.icon}
                                {item.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Summary Section */}
              {userData.userType !== "Front Office" && (
                <div className="bg-white rounded-lg shadow-md overflow-hidden">
                  <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-100">
                    <h2 className="text-base font-semibold text-gray-800">Financial Summary</h2>
                  </div>
                  <div className="p-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="border rounded-lg p-4 bg-green-50 hover:shadow-sm transition-shadow">
                        <p className="text-sm text-gray-500 mb-1">Total Income ({selectedYear})</p>
                        <p className="text-2xl font-bold text-green-600">₹ {totalIncome.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>
                      <div className="border rounded-lg p-4 bg-red-50 hover:shadow-sm transition-shadow">
                        <p className="text-sm text-gray-500 mb-1">Total Expense ({selectedYear})</p>
                        <p className="text-2xl font-bold text-red-600">₹ {totalExpense.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* User Profile Section */}
              <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-100">
                  <h2 className="text-base font-semibold text-gray-800">User Profile</h2>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="border rounded-lg p-3 hover:shadow-sm transition-shadow">
                      <p className="text-xs text-gray-500 mb-0.5">Member ID</p>
                      <p className="text-base font-semibold text-gray-800">{userData.memberId || 'N/A'}</p>
                    </div>
                    <div className="border rounded-lg p-3 hover:shadow-sm transition-shadow">
                      <p className="text-xs text-gray-500 mb-0.5">Mobile Number</p>
                      <p className="text-base font-semibold text-gray-800">{userData.mobileNo || 'N/A'}</p>
                    </div>
                    <div className="border rounded-lg p-3 hover:shadow-sm transition-shadow">
                      <p className="text-xs text-gray-500 mb-0.5">Name</p>
                      <p className="text-base font-semibold text-gray-800">{userData.name || 'N/A'}</p>
                    </div>
                    <div className="border rounded-lg p-3 hover:shadow-sm transition-shadow">
                      <p className="text-xs text-gray-500 mb-0.5">User Type</p>
                      <p className="text-base font-semibold text-gray-800">{userData.userType || 'N/A'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white p-6 rounded-lg shadow-md text-center">
              <p className="text-gray-600">No user data found.</p>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}