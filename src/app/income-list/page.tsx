"use client";
import { useAuth } from "../../context/AuthContext";
import ProtectedRoute from "../../components/ProtectedRoute";
import { useEffect, useState } from "react";
import { getUserDoc } from "../../utils/getUserDoc";
import { useRouter } from "next/navigation";
import { db } from "../../firebase/config";
import { ref, get } from "firebase/database";

interface IncomeItem {
  key: string;
  date: string;
  receiptNumber: string;
  name: string;
  amount: number;
  category: string;
}

export default function IncomeListPage() {
  const { user } = useAuth();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [incomes, setIncomes] = useState<IncomeItem[]>([]);
  const [incomesLoading, setIncomesLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (user) {
      getUserDoc(user.uid)
        .then((data) => {
          setUserData(data);
        })
        .finally(() => setLoading(false));
    }
  }, [user]);

  useEffect(() => {
    if (userData) {
      fetchIncomes();
    }
  }, [userData]);

  const fetchIncomes = async () => {
    try {
      setIncomesLoading(true);
      const currentYear = new Date().getFullYear().toString();
      const incomesRef = ref(db, `UAT/Accounts/${currentYear}/Income`);
      const snapshot = await get(incomesRef);
      
      if (snapshot.exists()) {
        const data = snapshot.val();
        const incomeList: IncomeItem[] = Object.keys(data).map((key) => ({
          key,
          ...data[key],
        }));
        
        // Sort by date descending (most recent first)
        incomeList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setIncomes(incomeList);
      } else {
        setIncomes([]);
      }
    } catch (error) {
      console.error("Error fetching incomes:", error);
      setIncomes([]);
    } finally {
      setIncomesLoading(false);
    }
  };

  // Check if user has permission to access this page
  const canAccess = userData && 
    (userData.userType === "Accounts" || userData.userType === "GB");

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
              onClick={() => router.push("/dashboard")}
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
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center mb-6">
            <button
              onClick={() => router.push("/dashboard")}
              className="mr-4 text-blue-600 hover:text-blue-800"
            >
              ← Back to Dashboard
            </button>
            <h1 className="text-3xl font-bold">Income List</h1>
          </div>

          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">
                  Incomes for {new Date().getFullYear()}
                </h2>
                <button
                  onClick={fetchIncomes}
                  className="text-blue-600 hover:text-blue-800 text-sm"
                >
                  Refresh
                </button>
              </div>
            </div>

            {incomesLoading ? (
              <div className="p-6 text-center text-gray-500">
                Loading incomes...
              </div>
            ) : incomes.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                No incomes found for this year.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Receipt Number
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Category
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {incomes.map((income) => (
                      <tr key={income.key} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(income.date).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {income.receiptNumber}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {income.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {income.category}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-green-600">
                          ₹ {income.amount.toLocaleString('en-IN', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td colSpan={4} className="px-6 py-4 text-right text-sm font-semibold text-gray-700">
                        Total:
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-bold text-green-600">
                        ₹ {incomes.reduce((sum, i) => sum + i.amount, 0).toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}