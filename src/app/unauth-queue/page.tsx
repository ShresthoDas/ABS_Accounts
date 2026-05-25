"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext";
import ProtectedRoute from "../../components/ProtectedRoute";
import { getUserDoc } from "../../utils/getUserDoc";
import { db } from "../../firebase/config";
import { ref, get, push, set, update } from "firebase/database";
import {
  dbPath,
  DEFAULTS,
  getCurrentYearString,
  hasAccess,
  PAYMENT_MODES,
  requiresReferenceNumber,
  ROUTES,
} from "../../utils/constants";

export default function UnauthQueuePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [queueItems, setQueueItems] = useState<any[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) {
      getUserDoc(user.uid)
        .then((data) => setUserData(data))
        .finally(() => setLoading(false));
    }
  }, [user]);

  useEffect(() => {
    if (userData) {
      fetchQueue();
    }
  }, [userData]);

  const fetchQueue = async () => {
    try {
      setError("");
      const queueRef = ref(db, dbPath.unAuthQueue);
      const snapshot = await get(queueRef);
      if (snapshot.exists()) {
        const data = snapshot.val();
        const list = Object.entries(data).map(([key, value]) => ({ key, ...(value as any) }));
        setQueueItems(list.sort((a, b) => (a.requestedAt > b.requestedAt ? -1 : 1)));
      } else {
        setQueueItems([]);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to load pending approvals.");
    }
  };

  const generateMemberId = async (): Promise<string> => {
    const counterRef = ref(db, dbPath.memberCounter);
    const snapshot = await get(counterRef);
    let nextNumber = 1;
    if (snapshot.exists()) {
      nextNumber = snapshot.val() + 1;
    }
    await set(counterRef, nextNumber);
    return `ABSPM-${nextNumber}`;
  };

  const generateReceiptNumber = async (): Promise<string> => {
    const yearSuffix = new Date().getFullYear().toString().slice(-2);
    const receiptCounterRef = ref(db, dbPath.receiptCounter(yearSuffix));
    const snapshot = await get(receiptCounterRef);
    let nextNumber = 1;
    if (snapshot.exists()) {
      nextNumber = snapshot.val() + 1;
    }
    const receiptNumber = `ABS/${yearSuffix}/${nextNumber}`;
    await set(receiptCounterRef, nextNumber);
    return receiptNumber;
  };

  const createAuthUser = async (
    mobileNumber: string,
    userType: string,
    nameValue: string,
    memberId?: string
  ) => {
    const email = `${mobileNumber}@abs.com`;
    const password = "Test123";
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    const effectiveUserType = userType === "New Member" ? "Member" : userType;

    if (!apiKey) {
      throw new Error("Missing Firebase API key.");
    }

    const signUpRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          returnSecureToken: true,
        }),
      }
    );

    const signUpData = await signUpRes.json();
    if (!signUpRes.ok) {
      if (signUpData.error?.message === "EMAIL_EXISTS") {
        return { alreadyExists: true, email };
      }
      throw new Error(signUpData.error?.message || "Failed to create auth user.");
    }

    const uid = signUpData.localId;
    const saveRes = await fetch("/api/save-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid,
        name: nameValue,
        mobileNo: mobileNumber,
        userType: effectiveUserType,
        email,
        memberId,
      }),
    });

    const saveData = await saveRes.json();
    if (!saveRes.ok) {
      throw new Error(saveData.error || "Failed to save user details.");
    }

    return { alreadyExists: false, uid, email };
  };

  const approveQueueItem = async (item: any) => {
    if (!user || !userData) return;
    setActionLoading(item.key);
    setError("");

    try {
      const targetYear = item.targetYear || getCurrentYearString();
      const currentYear = targetYear;
      const memberData = item.memberData || {};
      let memberKey = item.originalMemberKey || null;
      let memberIdToSave: string | undefined = memberData.memberId;
      let incomeCreated = false;

      if (item.queueType === "newMember") {
        const newMemberId = await generateMemberId();
        memberIdToSave = newMemberId;
        const membersRef = push(ref(db, dbPath.members(currentYear)));
        memberKey = membersRef.key;
        const record = {
          ...memberData,
          memberId: newMemberId,
          key: memberKey,
          createdAt: new Date().toISOString(),
          createdBy: user.uid,
        };
        await set(membersRef, record);

        if (memberData.paymentStatus) {
          const receiptNumber = await generateReceiptNumber();
          const incomeRef = push(ref(db, dbPath.income(currentYear)));
          const incomeKey = incomeRef.key;
          const incomeRecord = {
            key: incomeKey,
            date: new Date().toISOString().split("T")[0],
            receiptNumber,
            name: memberData.name,
            mobileNumber: memberData.mobileNumber,
            panNumber: memberData.panNumber,
            amount: parseFloat(memberData.amount || "0"),
            category: DEFAULTS.MEMBERSHIP_INCOME_CATEGORY,
            modeOfPayment: memberData.modeOfPayment,
            chequeNumber: memberData.chequeNumber || null,
            inputBy: userData.name || "Admin",
            createdAt: new Date().toISOString(),
            createdBy: user.uid,
            memberLink: memberKey,
          };
          await set(incomeRef, incomeRecord);
          await update(ref(db, `${dbPath.members(currentYear)}/${memberKey}`), {
            incomeKey,
            receiptNumber,
          });
          incomeCreated = true;
          const totalIncomeRef = ref(db, dbPath.totalIncome(currentYear));
          const totalSnapshot = await get(totalIncomeRef);
          const currentTotal = totalSnapshot.exists() ? totalSnapshot.val() : 0;
          await set(totalIncomeRef, currentTotal + parseFloat(memberData.amount || "0"));
        }
      } else {
        if (!memberKey) {
          throw new Error("No original member record found to update.");
        }
        const memberRef = ref(db, `${dbPath.members(currentYear)}/${memberKey}`);
        const existingSnapshot = await get(memberRef);
        const existingMember = existingSnapshot.exists() ? existingSnapshot.val() : null;
        if (!existingMember) {
          throw new Error("Original member record no longer exists.");
        }
        await update(memberRef, {
          ...memberData,
          updatedAt: new Date().toISOString(),
        });

        if (!existingMember.paymentStatus && memberData.paymentStatus) {
          const receiptNumber = await generateReceiptNumber();
          const incomeRef = push(ref(db, dbPath.income(currentYear)));
          const incomeKey = incomeRef.key;
          const incomeRecord = {
            key: incomeKey,
            date: new Date().toISOString().split("T")[0],
            receiptNumber,
            name: memberData.name,
            mobileNumber: memberData.mobileNumber,
            panNumber: memberData.panNumber,
            amount: parseFloat(memberData.amount || "0"),
            category: DEFAULTS.MEMBERSHIP_INCOME_CATEGORY,
            modeOfPayment: memberData.modeOfPayment,
            chequeNumber: memberData.chequeNumber || null,
            inputBy: userData.name || "Admin",
            createdAt: new Date().toISOString(),
            createdBy: user.uid,
            memberLink: memberKey,
          };
          await set(incomeRef, incomeRecord);
          await update(memberRef, {
            incomeKey,
            receiptNumber,
          });
          incomeCreated = true;
          const totalIncomeRef = ref(db, dbPath.totalIncome(currentYear));
          const totalSnapshot = await get(totalIncomeRef);
          const currentTotal = totalSnapshot.exists() ? totalSnapshot.val() : 0;
          await set(totalIncomeRef, currentTotal + parseFloat(memberData.amount || "0"));
        }
      }

      let userAuthResult = "skip";
      try {
        const authResult = await createAuthUser(
          item.requester.mobileNumber,
          item.requester.userType,
          item.memberData.name || item.requester.name,
          memberIdToSave
        );
        userAuthResult = authResult.alreadyExists ? "already_exists" : "created";
      } catch (authError) {
        console.error("Auth creation failed", authError);
        userAuthResult = "failed";
      }

      const queueRef = ref(db, `${dbPath.unAuthQueue}/${item.key}`);
      await update(queueRef, {
        status: "approved",
        approvedAt: new Date().toISOString(),
        approvedBy: userData.name || "Admin",
        approvedByUid: user.uid,
        memberKey: memberKey || null,
        incomeCreated,
        authResult: userAuthResult,
      });

      await fetchQueue();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to approve request.");
    } finally {
      setActionLoading(null);
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

  const isAuthorized = userData && hasAccess(userData.userType);

  if (!isAuthorized) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Access Denied</h2>
            <p className="text-gray-600">Only GB and Accounts users can view pending approvals.</p>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Pending Approvals</h1>
              <p className="text-sm text-gray-500 mt-1">Review pending signup and member update requests submitted by users.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => router.push(ROUTES.DASHBOARD)}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                &larr; Back to Dashboard
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Requested By</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mobile</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Request Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Requested At</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {queueItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                      No pending approvals found.
                    </td>
                  </tr>
                ) : (
                  queueItems.map((item) => (
                    <tr key={item.key}>
                      <td className="px-4 py-4 text-sm text-gray-700">
                        {item.requester?.name || "Unknown"}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">{item.requester?.userType || "-"}</td>
                      <td className="px-4 py-4 text-sm text-gray-700">{item.requester?.mobileNumber || "-"}</td>
                      <td className="px-4 py-4 text-sm text-gray-700">{item.queueType === "newMember" ? "New Member" : "Member Update"}</td>
                      <td className="px-4 py-4 text-sm">
                        <span className={`px-2 py-1 inline-flex text-xs font-semibold rounded-full ${item.status === "approved" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">{new Date(item.requestedAt).toLocaleString("en-IN")}</td>
                      <td className="px-4 py-4 text-right text-sm font-medium">
                        {item.status === "pending" ? (
                          <button
                            onClick={() => approveQueueItem(item)}
                            disabled={actionLoading === item.key}
                            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            {actionLoading === item.key ? "Approving..." : "Approve"}
                          </button>
                        ) : (
                          <span className="text-gray-500">Approved</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Request Details</h2>
            {queueItems.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {queueItems.slice(0, 3).map((item) => (
                  <div key={item.key} className="border rounded-lg p-4 bg-gray-50">
                    <p className="text-sm text-gray-600">Request Type</p>
                    <p className="font-semibold text-gray-900">{item.queueType === "newMember" ? "New Member" : "Member Update"}</p>
                    <p className="text-sm text-gray-600 mt-3">Member Name</p>
                    <p className="text-gray-900">{item.memberData?.name || "N/A"}</p>
                    <p className="text-sm text-gray-600 mt-3">Mobile</p>
                    <p className="text-gray-900">{item.memberData?.mobileNumber || item.requester?.mobileNumber}</p>
                    <p className="text-sm text-gray-600 mt-3">Payment Status</p>
                    <p className="text-gray-900">{item.memberData?.paymentStatus ? "Paid" : "Pending"}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">Pending approvals will appear here once users submit signup requests.</p>
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
