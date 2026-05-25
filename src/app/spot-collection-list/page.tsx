"use client";
import { useAuth } from "../../context/AuthContext";
import ProtectedRoute from "../../components/ProtectedRoute";
import { useEffect, useState } from "react";
import { getUserDoc } from "../../utils/getUserDoc";
import { useRouter } from "next/navigation";
import { db } from "../../firebase/config";
import { ref, get } from "firebase/database";
import { dbPath, ROUTES } from "../../utils/constants";
import { useFinancialYear } from "../../context/FinancialYearContext";

interface SpotCollectionItem {
  key: string;
  date?: string;
  receiptNumber?: string;
  name?: string;
  mobileNumber?: string;
  panNumber?: string;
  amount?: number;
  modeOfPayment?: string;
  chequeNumber?: string | null;
  inputBy?: string;
  [key: string]: any;
}

const SPOT_COLLECTION_ALLOWED_TYPES = ["Accounts", "GB", "Front Office"];

export default function SpotCollectionListPage() {
  const { user } = useAuth();
  const { selectedYear } = useFinancialYear();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<SpotCollectionItem[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (user) {
      getUserDoc(user.uid).then((data) => setUserData(data)).finally(() => setLoading(false));
    }
  }, [user]);

  useEffect(() => {
    if (userData) fetchRecords();
  }, [userData]);

  const fetchRecords = async () => {
    try {
      setRecordsLoading(true);
      const currentYear = selectedYear;
      const snapshot = await get(ref(db, dbPath.spotCollection(currentYear)));
      if (snapshot.exists()) {
        const data = snapshot.val();
        const list: SpotCollectionItem[] = Object.keys(data).map((key) => ({ key, ...data[key] }));
        list.sort((a, b) => {
          const dateA = a.date ? new Date(a.date).getTime() : 0;
          const dateB = b.date ? new Date(b.date).getTime() : 0;
          return dateB - dateA;
        });
        setRecords(list);
      } else {
        setRecords([]);
      }
    } catch (error) {
      console.error("Error fetching spot collections:", error);
      setRecords([]);
    } finally {
      setRecordsLoading(false);
    }
  };

  const canAccess = userData && SPOT_COLLECTION_ALLOWED_TYPES.includes(userData.userType);

  if (loading) return (<ProtectedRoute><div className="min-h-screen flex items-center justify-center bg-gray-50"><div>Loading...</div></div></ProtectedRoute>);

  if (!canAccess) return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md"><p className="font-medium">Access Denied</p><p className="text-sm">You do not have permission to view this page.</p></div>
          <button onClick={() => router.push(ROUTES.DASHBOARD)} className="mt-4 text-blue-600 hover:text-blue-800">← Back to Dashboard</button>
        </div>
      </div>
    </ProtectedRoute>
  );

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center mb-6">
            <button onClick={() => router.push(ROUTES.DASHBOARD)} className="mr-4 text-blue-600 hover:text-blue-800">← Back to Dashboard</button>
            <h1 className="text-3xl font-bold">Spot Collection List</h1>
          </div>

          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Spot Collections for {selectedYear}</h2>
                <div className="flex gap-2">
                  <button onClick={() => router.push(ROUTES.SPOT_COLLECTION_TRACKER)} className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm font-medium">+ New Spot Collection</button>
                  <button onClick={fetchRecords} className="text-blue-600 hover:text-blue-800 text-sm">Refresh</button>
                </div>
              </div>
            </div>

            {recordsLoading ? (
              <div className="p-6 text-center text-gray-500">Loading spot collections...</div>
            ) : records.length === 0 ? (
              <div className="p-6 text-center text-gray-500">No spot collections found for this year.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Receipt #</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mobile</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PAN</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mode</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {records.map((r) => (
                      <tr key={r.key} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`${ROUTES.SPOT_COLLECTION_LIST}/${r.key}`)}>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {r.date ? new Date(r.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-gray-900">{r.receiptNumber || '-'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{r.name}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{r.mobileNumber || '-'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{r.panNumber || '-'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-gray-900">₹ {(r.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">{r.modeOfPayment || '-'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td colSpan={5} className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Total:</td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">₹ {records.reduce((s, i) => s + (i.amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td></td>
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