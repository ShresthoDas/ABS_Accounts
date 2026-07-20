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

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

interface CashTransfer {
  key: string;
  date: string;
  amount: number;
  fromPerson: string;
  toPerson: string;
  inputBy: string;
  createdAt: string;
  description?: string | null;
}

export default function CashTransferListPage() {
  const { user } = useAuth();
  const { selectedYear } = useFinancialYear();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [transfers, setTransfers] = useState<CashTransfer[]>([]);
  const [totalTransferred, setTotalTransferred] = useState(0);
  const router = useRouter();

  useEffect(() => {
    if (user) {
      getUserDoc(user.uid)
        .then((data) => setUserData(data))
        .finally(() => setLoading(false));
    }
  }, [user]);

  useEffect(() => {
    if (userData && selectedYear) {
      fetchTransfers();
    }
  }, [userData, selectedYear]);

  const fetchTransfers = async () => {
    try {
      const transfersRef = ref(db, dbPath.cashTransfers(selectedYear));
      const snapshot = await get(transfersRef);

      if (snapshot.exists()) {
        const transferList: CashTransfer[] = [];
        let total = 0;

        snapshot.forEach((childSnapshot) => {
          const transfer = childSnapshot.val() as CashTransfer;
          transferList.push(transfer);
          total = roundMoney(total + (transfer.amount || 0));
        });

        // Sort by date descending (newest first)
        transferList.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        setTransfers(transferList);
        setTotalTransferred(total);
      } else {
        setTransfers([]);
        setTotalTransferred(0);
      }
    } catch (error) {
      console.error("Error fetching cash transfers:", error);
    }
  };

  const canAccess = userData && hasAccess(userData.userType);

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen flex items-center justify-center bg-gray-50"><div>Loading...</div></div>
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
            </div>
            <button onClick={() => router.push(ROUTES.DASHBOARD)} className="mt-4 text-blue-600 hover:text-blue-800">← Back to Dashboard</button>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center mb-6">
            <button onClick={() => router.push(ROUTES.DASHBOARD)} className="mr-4 text-blue-600 hover:text-blue-800">← Back to Dashboard</button>
            <h1 className="text-3xl font-bold">Cash Transfer History</h1>
          </div>

          {/* Summary Card */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <p className="text-sm text-purple-700 font-medium">Total Transfers</p>
              <p className="text-2xl font-bold text-purple-600">{transfers.length}</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-700 font-medium">Total Amount Transferred</p>
              <p className="text-2xl font-bold text-blue-600">₹ {totalTransferred.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
          </div>

          {/* New Transfer Button */}
          <div className="mb-4">
            <button
              onClick={() => router.push(ROUTES.CASH_TRANSFER_TRACKER)}
              className="bg-blue-600 text-white px-5 py-2.5 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            >
              + New Cash Transfer
            </button>
          </div>

          {/* Transfer List */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-800">Cash Transfers</h2>
              <button
                onClick={fetchTransfers}
                className="text-sm bg-gray-200 text-gray-700 px-3 py-1 rounded-md hover:bg-gray-300"
              >
                Refresh
              </button>
            </div>
            <div className="p-5">
              {transfers.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No cash transfers recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Date</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">From (Sender)</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">To (Receiver)</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-600">Amount</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Description</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Input By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transfers.map((transfer) => (
                        <tr key={transfer.key} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-700">{transfer.date}</td>
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                              {transfer.fromPerson}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                              {transfer.toPerson}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-gray-900">
                            ₹ {(transfer.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-2 text-gray-600 max-w-[200px] truncate">
                            {transfer.description || '-'}
                          </td>
                          <td className="px-3 py-2 text-gray-700">{transfer.inputBy || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}