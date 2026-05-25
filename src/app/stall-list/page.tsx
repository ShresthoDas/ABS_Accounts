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

interface StallItem {
  key: string;
  date?: string;
  stallNumber?: number;
  name?: string;
  stallType?: string;
  quantity?: number;
  totalAmount?: number;
  paidAmount?: number;
  pendingAmount?: number;
  mobileNumber?: string;
  panNumber?: string;
  [key: string]: any;
}

export default function StallListPage() {
  const { user } = useAuth();
  const { selectedYear } = useFinancialYear();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [stalls, setStalls] = useState<StallItem[]>([]);
  const [stallsLoading, setStallsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (user) {
      getUserDoc(user.uid)
        .then((data) => setUserData(data))
        .finally(() => setLoading(false));
    }
  }, [user]);

  useEffect(() => {
    if (userData) {
      fetchStalls();
    }
  }, [userData]);

  const fetchStalls = async () => {
    try {
      setStallsLoading(true);
      const currentYear = selectedYear;
      const stallsRef = ref(db, dbPath.stalls(currentYear));
      const snapshot = await get(stallsRef);

      if (snapshot.exists()) {
        const data = snapshot.val();
        const stallList: StallItem[] = Object.keys(data).map((key) => ({
          key,
          ...data[key],
        }));
        stallList.sort((a, b) => {
          const dateA = a.date ? new Date(a.date).getTime() : 0;
          const dateB = b.date ? new Date(b.date).getTime() : 0;
          return dateB - dateA;
        });
        setStalls(stallList);
      } else {
        setStalls([]);
      }
    } catch (error) {
      console.error("Error fetching stalls:", error);
      setStalls([]);
    } finally {
      setStallsLoading(false);
    }
  };

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
            <button onClick={() => router.push(ROUTES.DASHBOARD)} className="mt-4 text-blue-600 hover:text-blue-800">← Back to Dashboard</button>
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
            <button onClick={() => router.push(ROUTES.DASHBOARD)} className="mr-4 text-blue-600 hover:text-blue-800">← Back to Dashboard</button>
            <h1 className="text-3xl font-bold">Stall List</h1>
          </div>

          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Stalls for {selectedYear}</h2>
                <div className="flex gap-2">
                  <button onClick={() => router.push(ROUTES.STALL_TRACKER)} className="bg-teal-600 text-white px-4 py-2 rounded-md hover:bg-teal-700 text-sm font-medium">
                    + New Stall Booking
                  </button>
                  <button onClick={fetchStalls} className="text-blue-600 hover:text-blue-800 text-sm">Refresh</button>
                </div>
              </div>
            </div>

            {stallsLoading ? (
              <div className="p-6 text-center text-gray-500">Loading stalls...</div>
            ) : stalls.length === 0 ? (
              <div className="p-6 text-center text-gray-500">No stall bookings found for this year.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stall No.</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Paid</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Pending</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {stalls.map((stall) => (
                      <tr
                        key={stall.key}
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => router.push(`${ROUTES.STALL_LIST}/${stall.key}`)}
                      >
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {stall.date ? new Date(stall.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{stall.stallNumber ?? '-'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{stall.name}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${stall.stallType === 'Food' ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'}`}>
                            {stall.stallType || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{stall.quantity ?? 1}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                          ₹ {(stall.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-green-600 font-medium">
                          ₹ {(stall.paidAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                          {(stall.pendingAmount || 0) > 0 ? (
                            <span className="text-red-600 font-medium">
                              ₹ {(stall.pendingAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          ) : (
                            <span className="text-green-600 font-medium">Cleared</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td colSpan={5} className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Totals:</td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">
                        ₹ {stalls.reduce((s, i) => s + (i.totalAmount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-green-600">
                        ₹ {stalls.reduce((s, i) => s + (i.paidAmount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-red-600">
                        ₹ {stalls.reduce((s, i) => s + (i.pendingAmount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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