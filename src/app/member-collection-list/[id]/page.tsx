"use client";
import { useAuth } from "../../../context/AuthContext";
import ProtectedRoute from "../../../components/ProtectedRoute";
import { useEffect, useState } from "react";
import { getUserDoc } from "../../../utils/getUserDoc";
import { useRouter, useParams } from "next/navigation";
import { db } from "../../../firebase/config";
import { ref, get, set, update, push } from "firebase/database";
import { logAudit } from "../../../utils/auditLog";
import { dbPath, ROUTES } from "../../../utils/constants";
import { useFinancialYear } from "../../../context/FinancialYearContext";

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

const COLLECTION_ITEMS = [
  {
    id: "memberBadge",
    label: "Member Badge",
    collectedKey: "memberBadgeCollected",
    countKey: "memberBadgeCount",
  },
  {
    id: "shosthiLunchCoupon",
    label: "Shosthi Lunch Coupon",
    collectedKey: "shosthiLunchCouponCollected",
    countKey: "shosthiLunchCouponCount",
  },
  {
    id: "dashamiSindurdan",
    label: "Dashami Sindurdan Batch",
    collectedKey: "dashamiSindurdanCollected",
    countKey: "dashamiSindurdanCount",
  },
  {
    id: "dashamiDinnerCoupon",
    label: "Dashami Dinner Coupon",
    collectedKey: "dashamiDinnerCouponCollected",
    countKey: "dashamiDinnerCouponCount",
  },
];

export default function MemberCollectionDetailPage() {
  const { user } = useAuth();
  const { selectedYear } = useFinancialYear();
  const [userData, setUserData] = useState<any>(null);
  const [member, setMember] = useState<MemberItem | null>(null);
  const [collection, setCollection] = useState<MemberCollectionItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const params = useParams();

  // Form state
  const [formData, setFormData] = useState<Record<string, any>>({
    memberBadgeCollected: false,
    memberBadgeCount: 0,
    shosthiLunchCouponCollected: false,
    shosthiLunchCouponCount: 0,
    dashamiSindurdanCollected: false,
    dashamiSindurdanCount: 0,
    dashamiDinnerCouponCollected: false,
    dashamiDinnerCouponCount: 0,
  });

  useEffect(() => {
    if (user) {
      getUserDoc(user.uid).then((data) => setUserData(data));
    }
  }, [user]);

  useEffect(() => {
    if (userData && params.id) {
      fetchData();
    }
  }, [userData, params.id]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const currentYear = selectedYear;
      const memberRef = ref(db, `${dbPath.members(currentYear)}/${params.id}`);
      const collectionsRef = ref(db, dbPath.memberCollections(currentYear));

      const [memberSnap, collectionsSnap] = await Promise.all([
        get(memberRef),
        get(collectionsRef),
      ]);

      if (!memberSnap.exists()) {
        setMember(null);
        return;
      }

      const memberData = { key: params.id as string, ...memberSnap.val() };
      if (!memberData.paymentStatus) {
        setMember(null);
        return;
      }

      setMember(memberData);

      let collectionData: MemberCollectionItem | null = null;
      if (collectionsSnap.exists()) {
        const data = collectionsSnap.val();
        const found = Object.values(data).find(
          (c: any) => c.memberKey === params.id
        ) as MemberCollectionItem | undefined;
        if (found) collectionData = { ...found };
      }

      setCollection(collectionData);
      if (collectionData) {
        setFormData({
          memberBadgeCollected: collectionData.memberBadgeCollected || false,
          memberBadgeCount: collectionData.memberBadgeCount || 0,
          shosthiLunchCouponCollected: collectionData.shosthiLunchCouponCollected || false,
          shosthiLunchCouponCount: collectionData.shosthiLunchCouponCount || 0,
          dashamiSindurdanCollected: collectionData.dashamiSindurdanCollected || false,
          dashamiSindurdanCount: collectionData.dashamiSindurdanCount || 0,
          dashamiDinnerCouponCollected: collectionData.dashamiDinnerCouponCollected || false,
          dashamiDinnerCouponCount: collectionData.dashamiDinnerCouponCount || 0,
        });
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: string, value: any) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      // If a "Collected" field is set to false, reset its count to 0
      const item = COLLECTION_ITEMS.find((i) => i.collectedKey === field);
      if (item && value === false) {
        next[item.countKey] = 0;
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!member || !userData || !user) return;

    try {
      setSaving(true);
      const currentYear = selectedYear;
      const collectionRef = collection
        ? ref(db, `${dbPath.memberCollections(currentYear)}/${collection.key}`)
        : push(ref(db, dbPath.memberCollections(currentYear)));

      const collectionKey = collection ? collection.key : collectionRef.key;
      const isNew = !collection;

      const updatedData: any = {
        key: collectionKey,
        memberKey: member.key,
        memberId: member.memberId,
        name: member.name,
        mobileNumber: member.mobileNumber,
        ...formData,
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid,
      };

      await set(collectionRef, updatedData);

      await logAudit({
        action: isNew ? "CREATE" : "UPDATE",
        entityType: "MemberCollection",
        entityId: collectionKey as string,
        previousData: collection,
        newData: updatedData,
        changedBy: userData.name || user.email || "Unknown",
        changedByUid: user.uid,
        changedAt: new Date().toISOString(),
      });

      alert("Collection details saved successfully!");
      router.push(ROUTES.MEMBER_COLLECTION_LIST);
    } catch (error) {
      console.error("Error saving collection:", error);
      alert("Error saving collection. Please try again.");
    } finally {
      setSaving(false);
    }
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

  if (!member) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 py-8 px-4">
          <div className="max-w-2xl mx-auto">
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-md">
              Member not found or payment not completed.
            </div>
            <button onClick={() => router.push(ROUTES.MEMBER_COLLECTION_LIST)} className="mt-4 text-blue-600 hover:text-blue-800">
              ← Back to Collection List
            </button>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  const canAccess = userData && (userData.userType === "Accounts" || userData.userType === "GB" || userData.userType === "Front Office");

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center mb-6">
            <button onClick={() => router.push(ROUTES.MEMBER_COLLECTION_LIST)} className="mr-4 text-blue-600 hover:text-blue-800">← Back</button>
            <h1 className="text-3xl font-bold">Collection Details</h1>
          </div>

          {!canAccess && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
              <p className="font-medium">Read-only access</p>
              <p className="text-sm">You do not have permission to edit collection details.</p>
            </div>
          )}

          <div className="bg-white rounded-lg shadow p-6">
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h2 className="text-lg font-semibold text-gray-800">{member.name}</h2>
              <p className="text-sm text-gray-600">Member ID: {member.memberId} | Mobile: {member.mobileNumber}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {COLLECTION_ITEMS.map((item) => (
                <div key={item.id} className="border border-gray-200 rounded-lg p-4">
                  <h3 className="text-md font-semibold text-gray-800 mb-3">{item.label}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Collected</label>
                      <select
                        value={formData[item.collectedKey] ? "true" : "false"}
                        onChange={(e) => handleChange(item.collectedKey, e.target.value === "true")}
                        disabled={!canAccess}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="false">No</option>
                        <option value="true">Yes</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">No. of Items Collected</label>
                      <input
                        type="number"
                        value={formData[item.countKey]}
                        onChange={(e) => handleChange(item.countKey, parseInt(e.target.value) || 0)}
                        disabled={!canAccess || !formData[item.collectedKey]}
                        min="0"
                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          !formData[item.collectedKey] ? "bg-gray-100 text-gray-500 cursor-not-allowed" : "border-gray-300"
                        }`}
                      />
                    </div>
                  </div>
                </div>
              ))}

              <div className="flex gap-3 pt-4 border-t">
                <button
                  type="submit"
                  disabled={saving || !canAccess}
                  className="flex-1 bg-indigo-600 text-white py-3 px-4 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? "Saving..." : "Save Collection Details"}
                </button>
                <button
                  type="button"
                  onClick={() => router.push(ROUTES.MEMBER_COLLECTION_LIST)}
                  className="flex-1 bg-gray-300 text-gray-700 py-3 px-4 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}