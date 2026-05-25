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

interface AdItem {
  key: string;
  date?: string;
  name?: string;
  adType?: string;
  size?: string;
  videoLength?: string;
  quantity?: number;
  totalAmount?: number;
  paidAmount?: number;
  pendingAmount?: number;
  mobileNumber?: string;
  panNumber?: string;
  [key: string]: any;
}

export default function AdListPage() {
  const { user } = useAuth();
  const { selectedYear } = useFinancialYear();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [ads, setAds] = useState<AdItem[]>([]);
  const [adsLoading, setAdsLoading] = useState(true);
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
      fetchAds();
    }
  }, [userData]);

  const fetchAds = async () => {
    try {
      setAdsLoading(true);
      const currentYear = selectedYear;
      const adsRef = ref(db, dbPath.ads(currentYear));
      const snapshot = await get(adsRef);

      if (snapshot.exists()) {
        const data = snapshot.val();
        const adList: AdItem[] = Object.keys(data).map((key) => ({
          key,
          ...data[key],
        }));
        adList.sort((a, b) => {
          const dateA = a.date ? new Date(a.date).getTime() : 0;
          const dateB = b.date ? new Date(b.date).getTime() : 0;
          return dateB - dateA;
        });
        setAds(adList);
      } else {
        setAds([]);
      }
    } catch (error) {
      console.error("Error fetching ads:", error);
      setAds([]);
    } finally {
      setAdsLoading(false);
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
            <h1 className="text-3xl font-bold">Advertisement List</h1>
          </div>

          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Advertisements for {selectedYear}</h2>
                <div className="flex gap-2">
                  <button onClick={() => router.push(ROUTES.AD_TRACKER)} className="bg-teal-600 text-white px-4 py-2 rounded-md hover:bg-teal-700 text-sm font-medium">
                    + New Ad Booking
                  </button>
                  <button onClick={fetchAds} className="text-blue-600 hover:text-blue-800 text-sm">Refresh</button>
                </div>
              </div>
            </div>

            {adsLoading ? (
              <div className="p-6 text-center text-gray-500">Loading advertisements...</div>
            ) : ads.length === 0 ? (
              <div className="p-6 text-center text-gray-500">No advertisement bookings found for this year.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ad Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Size / Video</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Qty</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Paid</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Pending</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {ads.map((ad) => (
                      <tr
                        key={ad.key}
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => router.push(`${ROUTES.AD_LIST}/${ad.key}`)}
                      >
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {ad.date ? new Date(ad.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{ad.name}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${ad.adType === 'Banner' ? 'bg-purple-100 text-purple-800' : 'bg-yellow-100 text-yellow-800'}`}>
                            {ad.adType || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {ad.adType === 'Banner' ? (ad.size || '-') : (ad.videoLength ? `${ad.videoLength}s` : '-')}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{ad.quantity ?? 1}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                          ₹ {(ad.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-green-600 font-medium">
                          ₹ {(ad.paidAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                          {(ad.pendingAmount || 0) > 0 ? (
                            <span className="text-red-600 font-medium">
                              ₹ {(ad.pendingAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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
                        ₹ {ads.reduce((s, i) => s + (i.totalAmount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-green-600">
                        ₹ {ads.reduce((s, i) => s + (i.paidAmount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-red-600">
                        ₹ {ads.reduce((s, i) => s + (i.pendingAmount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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