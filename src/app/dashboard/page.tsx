"use client";
import { useAuth } from "../../context/AuthContext";
import ProtectedRoute from "../../components/ProtectedRoute";
import { useEffect, useState } from "react";
import { getUserDoc } from "../../utils/getUserDoc";
import { useRouter } from "next/navigation";
import { db } from "../../firebase/config";
import { ref, get } from "firebase/database";

export default function DashboardPage() {
  const { user } = useAuth();
  const [userData, setUserData] = useState<any>(null);
  const [totalExpense, setTotalExpense] = useState<number>(0);
  const [totalIncome, setTotalIncome] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (user) {
      // Fetch user data from Firestore
      getUserDoc(user.uid)
        .then(data => setUserData(data))
        .finally(() => setLoading(false));
    }
  }, [user]);

  // Fetch total expense and total income for current year
  useEffect(() => {
    const fetchTotals = async () => {
      const currentYear = new Date().getFullYear().toString();
      
      // Fetch total expense
      const totalExpenseRef = ref(db, `UAT/Accounts/${currentYear}/total_expense`);
      const expenseSnapshot = await get(totalExpenseRef);
      if (expenseSnapshot.exists()) {
        setTotalExpense(expenseSnapshot.val() || 0);
      } else {
        setTotalExpense(0);
      }

      // Fetch total income
      const totalIncomeRef = ref(db, `UAT/Accounts/${currentYear}/total_income`);
      const incomeSnapshot = await get(totalIncomeRef);
      if (incomeSnapshot.exists()) {
        setTotalIncome(incomeSnapshot.val() || 0);
      } else {
        setTotalIncome(0);
      }
    };

    fetchTotals();
  }, []);

  // Check if user has permission to access Expense Tracker, Income Tracker, and Add Member
  const canAccessExpenseTracker = userData && 
    (userData.userType === "Accounts" || userData.userType === "GB");
  
  const canAccessIncomeTracker = userData && 
    (userData.userType === "Accounts" || userData.userType === "GB");
  
  const canAccessAddMember = userData && 
    (userData.userType === "Accounts" || userData.userType === "GB");

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-8 text-center text-gray-800">Dashboard</h1>
          
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="text-gray-600">Loading your data...</div>
            </div>
          ) : userData ? (
            <div className="space-y-6">
              {/* Navigation Buttons Section */}
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h2 className="text-xl font-semibold mb-4 text-gray-700">Quick Access</h2>
                <div className="flex flex-wrap gap-3">
                  {/* Expense Tracker Button - Only visible for Accounts or GB users */}
                  {canAccessExpenseTracker && (
                    <button
                      onClick={() => router.push("/expense-tracker")}
                      className="bg-green-600 text-white px-6 py-3 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 font-medium transition-colors duration-200 flex items-center"
                    >
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 36v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      Expense Tracker
                    </button>
                  )}
                  
                  {/* Expense List Button - Only visible for Accounts or GB users */}
                  {canAccessExpenseTracker && (
                    <button
                      onClick={() => router.push("/expense-list")}
                      className="bg-green-700 text-white px-6 py-3 rounded-md hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-600 font-medium transition-colors duration-200 flex items-center"
                    >
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                      Expense List
                    </button>
                  )}
                  
                  {/* Income Tracker Button - Only visible for Accounts or GB users */}
                  {canAccessIncomeTracker && (
                    <button
                      onClick={() => router.push("/income-tracker")}
                      className="bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium transition-colors duration-200 flex items-center"
                    >
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Income Tracker
                    </button>
                  )}
                  
                  {/* Income List Button - Only visible for Accounts or GB users */}
                  {canAccessIncomeTracker && (
                    <button
                      onClick={() => router.push("/income-list")}
                      className="bg-blue-700 text-white px-6 py-3 rounded-md hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600 font-medium transition-colors duration-200 flex items-center"
                    >
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                      Income List
                    </button>
                  )}
                  
                  {/* Add Member Button - Only visible for Accounts or GB users */}
                  {canAccessAddMember && (
                    <button
                      onClick={() => router.push("/add-member")}
                      className="bg-indigo-600 text-white px-6 py-3 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium transition-colors duration-200 flex items-center"
                    >
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                      </svg>
                      Add Member
                    </button>
                  )}
                </div>
              </div>

              {/* User Details Section */}
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h2 className="text-xl font-semibold mb-4 text-gray-700">User Profile</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border rounded-lg p-4 hover:shadow-sm transition-shadow duration-200">
                    <p className="text-sm text-gray-500 mb-1">Member ID</p>
                    <p className="text-lg font-semibold text-gray-800">{userData.memberId || 'N/A'}</p>
                  </div>
                  
                  <div className="border rounded-lg p-4 hover:shadow-sm transition-shadow duration-200">
                    <p className="text-sm text-gray-500 mb-1">Mobile Number</p>
                    <p className="text-lg font-semibold text-gray-800">{userData.mobileNo || 'N/A'}</p>
                  </div>
                  
                  <div className="border rounded-lg p-4 hover:shadow-sm transition-shadow duration-200">
                    <p className="text-sm text-gray-500 mb-1">Name</p>
                    <p className="text-lg font-semibold text-gray-800">{userData.name || 'N/A'}</p>
                  </div>
                  
                  <div className="border rounded-lg p-4 hover:shadow-sm transition-shadow duration-200">
                    <p className="text-sm text-gray-500 mb-1">User Type</p>
                    <p className="text-lg font-semibold text-gray-800">{userData.userType || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Income Summary Section */}
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h2 className="text-xl font-semibold mb-4 text-gray-700">Income Summary</h2>
                <div className="border rounded-lg p-4 bg-green-50">
                  <p className="text-sm text-gray-500 mb-1">Total Income ({new Date().getFullYear()})</p>
                  <p className="text-2xl font-bold text-green-600">₹ {totalIncome.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
              </div>

              {/* Expense Summary Section */}
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h2 className="text-xl font-semibold mb-4 text-gray-700">Expense Summary</h2>
                <div className="border rounded-lg p-4 bg-red-50">
                  <p className="text-sm text-gray-500 mb-1">Total Expense ({new Date().getFullYear()})</p>
                  <p className="text-2xl font-bold text-red-600">₹ {totalExpense.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
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
