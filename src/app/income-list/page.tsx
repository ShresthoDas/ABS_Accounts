"use client";
import { useAuth } from "../../context/AuthContext";
import ProtectedRoute from "../../components/ProtectedRoute";
import { useEffect, useState } from "react";
import { getUserDoc } from "../../utils/getUserDoc";
import { useRouter } from "next/navigation";
import { db } from "../../firebase/config";
import { ref, get } from "firebase/database";
import { generateReceiptPDF } from "../../utils/generateReceiptPDF";
import { dbPath } from "../../utils/constants";
import { useFinancialYear } from "../../context/FinancialYearContext";

interface IncomeItem {
  key: string;
  date: string;
  receiptNumber: string;
  name: string;
  mobileNumber: string;
  panNumber: string;
  amount: number;
  category: string;
  modeOfPayment: string;
  chequeNumber: string;
  inputBy: string;
  createdAt: string;
}

export default function IncomeListPage() {
  const { user } = useAuth();
  const { selectedYear } = useFinancialYear();
  const [userData, setUserData] = useState<any>(null);
  const [incomes, setIncomes] = useState<IncomeItem[]>([]);
  const [incomesLoading, setIncomesLoading] = useState(true);
  const [sortField, setSortField] = useState<string>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const router = useRouter();

  useEffect(() => {
    if (user) {
      getUserDoc(user.uid).then((data) => setUserData(data));
    }
  }, [user]);

  const fetchIncomes = async () => {
    setIncomesLoading(true);
    try {
      const currentYear = selectedYear;
      const incomesRef = ref(db, dbPath.income(currentYear));
      const snapshot = await get(incomesRef);
      if (snapshot.exists()) {
        const data = snapshot.val();
        const list: IncomeItem[] = Object.keys(data).map((key) => ({
          key,
          ...data[key],
        }));
        setIncomes(list);
      } else {
        setIncomes([]);
      }
    } catch (error) {
      console.error("Error fetching incomes:", error);
    } finally {
      setIncomesLoading(false);
    }
  };

  useEffect(() => {
    if (userData) {
      fetchIncomes();
    }
  }, [userData, selectedYear]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const sortedIncomes = [...incomes].sort((a, b) => {
    const aVal = a[sortField as keyof IncomeItem];
    const bVal = b[sortField as keyof IncomeItem];
    if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  const totalAmount = incomes.reduce((sum, inc) => sum + (inc.amount || 0), 0);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center">
              <button onClick={() => router.push("/dashboard")} className="mr-4 text-blue-600 hover:text-blue-800">← Back to Dashboard</button>
              <h1 className="text-3xl font-bold">Income List</h1>
            </div>
            <div className="flex gap-3">
              <button onClick={fetchIncomes} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">↻ Refresh</button>
              <button onClick={() => router.push("/income-tracker")} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm">+ New Entry</button>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow overflow-x-auto">
            {incomesLoading ? (
              <div className="p-6 text-center text-gray-500">Loading...</div>
            ) : sortedIncomes.length === 0 ? (
              <div className="p-6 text-center text-gray-500">No income records found.</div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {["date", "receiptNumber", "name", "panNumber", "amount", "category", "modeOfPayment"].map((field) => (
                      <th key={field} onClick={() => handleSort(field)} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                        <div className="flex items-center gap-1">
                          {field === "receiptNumber" ? "Receipt#" : field.charAt(0).toUpperCase() + field.slice(1)}
                          {sortField === field && <span>{sortDirection === "asc" ? "▲" : "▼"}</span>}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sortedIncomes.map((income) => (
                    <tr key={income.key} onClick={() => router.push(`/income-list/${income.key}`)} className="hover:bg-gray-50 cursor-pointer">
                      <td className="px-4 py-3 whitespace-nowrap text-sm">{income.date}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">{income.receiptNumber}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">{income.name}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">{income.panNumber}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">₹ {income.amount?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">{income.category}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">{income.modeOfPayment}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Total:</td>
                    <td className="px-4 py-3 text-sm font-bold text-gray-900">₹ {totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}