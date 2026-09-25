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

interface MemberItem {
  key: string;
  memberId: string;
  name: string;
  mobileNumber: string;
  panNumber?: string;
  amount: number;
  paymentStatus: boolean;
  date?: string;
}

interface MemberCollectionItem {
  key: string;
  memberKey: string;
  memberId: string;
  name: string;
  mobileNumber: string;
  memberBadgeCollected: boolean;
  memberBadgeCount: number;
  shosthiLunchCouponCollected: boolean;
  shosthiLunchCouponCount: number;
  dashamiSindurdanCollected: boolean;
  dashamiSindurdanCount: number;
  dashamiDinnerCouponCollected: boolean;
  dashamiDinnerCouponCount: number;
  updatedAt: string;
  updatedBy: string;
}

export default function MemberCollectionListPage() {
  const { user } = useAuth();
  const { selectedYear } = useFinancialYear();
  const [userData, setUserData] = useState<any>(null);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [collections, setCollections] = useState<MemberCollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();

  useEffect(() => {
    if (user) {
      getUserDoc(user.uid).then((data) => setUserData(data));
    }
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const currentYear = selectedYear;
      const membersRef = ref(db, dbPath.members(currentYear));
      const collectionsRef = ref(db, dbPath.memberCollections(currentYear));

      const [membersSnap, collectionsSnap] = await Promise.all([
        get(membersRef),
        get(collectionsRef),
      ]);

      let memberList: MemberItem[] = [];
      if (membersSnap.exists()) {
        const data = membersSnap.val();
        memberList = Object.keys(data)
          .map((key) => ({ key, ...data[key] }))
          .filter((m) => m.paymentStatus === true);
      }

      let collectionList: MemberCollectionItem[] = [];
      if (collectionsSnap.exists()) {
        const data = collectionsSnap.val();
        collectionList = Object.keys(data).map((key) => ({ key, ...data[key] }));
      }

      setMembers(memberList);
      setCollections(collectionList);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userData) {
      fetchData();
    }
  }, [userData, selectedYear]);

  const getCollectionForMember = (memberKey: string) => {
    return collections.find((c) => c.memberKey === memberKey);
  };

  const filteredMembers = members.filter((m) =>
    m.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.memberId?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center">
              <button onClick={() => router.push("/dashboard")} className="mr-4 text-blue-600 hover:text-blue-800">← Back to Dashboard</button>
              <h1 className="text-3xl font-bold">Member Collection Tracker</h1>
            </div>
            <button onClick={fetchData} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">↻ Refresh</button>
          </div>

          <div className="mb-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or member ID..."
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="bg-white rounded-lg shadow overflow-x-auto">
            {loading ? (
              <div className="p-6 text-center text-gray-500">Loading...</div>
            ) : filteredMembers.length === 0 ? (
              <div className="p-6 text-center text-gray-500">No paid members found.</div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Member ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mobile</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Member Badge</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Shosthi Lunch</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dashami Sindurdan</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dashami Dinner</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredMembers.map((member) => {
                    const collection = getCollectionForMember(member.key);
                    return (
                      <tr key={member.key} className="hover:bg-gray-50 cursor-pointer">
                        <td className="px-4 py-3 whitespace-nowrap text-sm">{member.memberId}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">{member.name}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">{member.mobileNumber}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          {collection ? (
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              collection.memberBadgeCollected ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                            }`}>
                              {collection.memberBadgeCollected ? "✓" : "✗"} {collection.memberBadgeCount}
                            </span>
                          ) : (
                            <span className="text-gray-400">Not set</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          {collection ? (
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              collection.shosthiLunchCouponCollected ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                            }`}>
                              {collection.shosthiLunchCouponCollected ? "✓" : "✗"} {collection.shosthiLunchCouponCount}
                            </span>
                          ) : (
                            <span className="text-gray-400">Not set</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          {collection ? (
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              collection.dashamiSindurdanCollected ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                            }`}>
                              {collection.dashamiSindurdanCollected ? "✓" : "✗"} {collection.dashamiSindurdanCount}
                            </span>
                          ) : (
                            <span className="text-gray-400">Not set</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          {collection ? (
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              collection.dashamiDinnerCouponCollected ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                            }`}>
                              {collection.dashamiDinnerCouponCollected ? "✓" : "✗"} {collection.dashamiDinnerCouponCount}
                            </span>
                          ) : (
                            <span className="text-gray-400">Not set</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          <button
                            onClick={() => router.push(`${ROUTES.MEMBER_COLLECTION_DETAIL.replace('[id]', member.key)}`)}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            {collection ? "Edit" : "Add"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}