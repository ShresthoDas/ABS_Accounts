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
import { logAudit } from "../../utils/auditLog";

// Helper to get changed fields between two objects
const getChangedFields = (previousData: any, newData: any): { field: string; old: string; new: string }[] => {
  const changes: { field: string; old: string; new: string }[] = [];
  if (!previousData || !newData) return changes;

  const keySet = new Set([...Object.keys(previousData), ...Object.keys(newData)]);
  const allKeys = Array.from(keySet);
  for (const key of allKeys) {
    const oldVal = previousData[key] || "";
    const newVal = newData[key] || "";
    if (oldVal !== newVal && !key.startsWith("_") && key !== "key") {
      changes.push({
        field: key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()).trim(),
        old: String(oldVal),
        new: String(newVal),
      });
    }
  }
  return changes;
};

export default function UnauthQueuePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [queueItems, setQueueItems] = useState<any[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

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

  const toggleExpand = (key: string) => {
    setExpandedItem(expandedItem === key ? null : key);
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

        // Audit for new member approval
        await logAudit({
          action: "CREATE",
          entityType: "Member",
          entityId: memberKey as string,
          previousData: null,
          newData: record,
          changedBy: userData.name || "Admin",
          changedByUid: user.uid,
          changedAt: new Date().toISOString(),
        });
      } else if (item.queueType === "memberEdit") {
        // Handle member edit approval
        if (!memberKey) {
          throw new Error("No original member record found to update.");
        }
        const memberRef = ref(db, `${dbPath.members(currentYear)}/${memberKey}`);
        const existingSnapshot = await get(memberRef);
        const existingMember = existingSnapshot.exists() ? existingSnapshot.val() : null;
        if (!existingMember) {
          throw new Error("Original member record no longer exists.");
        }

        // Store previous data for audit
        const previousData = {
          name: existingMember.name,
          mobileNumber: existingMember.mobileNumber,
          panNumber: existingMember.panNumber,
          secondaryMemberName: existingMember.secondaryMemberName,
          address: existingMember.address,
          emailId: existingMember.emailId,
        };

        // Apply the updated fields to the member record
        await update(memberRef, {
          ...memberData,
          updatedAt: new Date().toISOString(),
          updatedBy: userData.name || "Admin",
        });

        // Log audit for the member edit approval
        await logAudit({
          action: "UPDATE",
          entityType: "Member",
          entityId: memberKey,
          previousData: previousData,
          newData: { ...memberData, _approvedBy: userData.name || "Admin", _approvedAt: new Date().toISOString() },
          changedBy: userData.name || "Admin",
          changedByUid: user.uid,
          changedAt: new Date().toISOString(),
        });
      } else {
        // Existing member update flow (with potential payment status change)
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

      // Create auth user if needed (only for new member queue items)
      if (item.queueType === "newMember") {
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
      } else {
        // For memberEdit and other queue types, just mark as approved
        const queueRef = ref(db, `${dbPath.unAuthQueue}/${item.key}`);
        await update(queueRef, {
          status: "approved",
          approvedAt: new Date().toISOString(),
          approvedBy: userData.name || "Admin",
          approvedByUid: user.uid,
          memberKey: memberKey || null,
          incomeCreated,
        });
      }

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

  const pendingItems = queueItems.filter((item) => item.status === "pending");
  const approvedItems = queueItems.filter((item) => item.status === "approved");

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

          <div className="bg-white rounded-lg shadow overflow-x-auto mb-8">
            <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800">
                Pending Requests ({pendingItems.length})
              </h2>
            </div>
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
                {pendingItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                      No pending approvals found.
                    </td>
                  </tr>
                ) : (
                  pendingItems.map((item) => (
                    <tr key={item.key}>
                      <td className="px-4 py-4 text-sm text-gray-700">
                        {item.requester?.name || "Unknown"}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">{item.requester?.userType || "-"}</td>
                      <td className="px-4 py-4 text-sm text-gray-700">{item.requester?.mobileNumber || "-"}</td>
                      <td className="px-4 py-4 text-sm">
                        {item.queueType === "newMember" ? (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800">New Member</span>
                        ) : item.queueType === "memberEdit" ? (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">Member Edit</span>
                        ) : (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">Member Update</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <span className={`px-2 py-1 inline-flex text-xs font-semibold rounded-full ${item.status === "approved" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">{new Date(item.requestedAt).toLocaleString("en-IN")}</td>
                      <td className="px-4 py-4 text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => toggleExpand(item.key)}
                            className="inline-flex items-center justify-center rounded-md bg-gray-100 px-3 py-2 text-gray-700 hover:bg-gray-200"
                          >
                            {expandedItem === item.key ? "Hide" : "View"}
                          </button>
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
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Expanded Detail Section */}
            {expandedItem && (
              <div className="border-t border-gray-200 p-6 bg-gray-50">
                {(() => {
                  const item = queueItems.find((i) => i.key === expandedItem);
                  if (!item) return null;

                  if (item.queueType === "memberEdit") {
                    const changes = getChangedFields(item.memberPreviousData, item.memberData);
                    return (
                      <div>
                        <h3 className="text-lg font-semibold text-gray-800 mb-4">Member Edit Details</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                          <div className="bg-white rounded-lg border p-4">
                            <h4 className="text-sm font-semibold text-gray-500 uppercase mb-3">Requester Info</h4>
                            <p className="text-sm text-gray-700"><span className="font-medium">Name:</span> {item.requester?.name}</p>
                            <p className="text-sm text-gray-700"><span className="font-medium">Mobile:</span> {item.requester?.mobileNumber}</p>
                            <p className="text-sm text-gray-700"><span className="font-medium">Member ID:</span> {item.originalMemberId}</p>
                          </div>
                          <div className="bg-white rounded-lg border p-4">
                            <h4 className="text-sm font-semibold text-gray-500 uppercase mb-3">Change Summary</h4>
                            <p className="text-sm text-gray-700"><span className="font-medium">Fields changed:</span> {changes.length}</p>
                            {item.memberData?.name && (
                              <p className="text-sm text-gray-700"><span className="font-medium">New Name:</span> {item.memberData.name}</p>
                            )}
                          </div>
                        </div>

                        {changes.length > 0 ? (
                          <div className="bg-white rounded-lg border overflow-hidden">
                            <div className="px-4 py-3 bg-gray-100 border-b">
                              <h4 className="text-sm font-semibold text-gray-700 uppercase">Changed Fields</h4>
                            </div>
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Field</th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-red-500 uppercase bg-red-50">Old Value</th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-green-500 uppercase bg-green-50">New Value</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {changes.map((change, idx) => (
                                  <tr key={idx} className="hover:bg-gray-50">
                                    <td className="px-4 py-2.5 text-sm font-medium text-gray-700">{change.field}</td>
                                    <td className="px-4 py-2.5 text-sm text-red-700 bg-red-50">{change.old || <span className="text-gray-400 italic">(empty)</span>}</td>
                                    <td className="px-4 py-2.5 text-sm text-green-700 bg-green-50">{change.new || <span className="text-gray-400 italic">(empty)</span>}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="bg-white rounded-lg border p-4 text-center text-gray-500">
                            No fields changed.
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Default view for newMember / other queue types
                  return (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="border rounded-lg p-4 bg-white">
                        <p className="text-sm text-gray-600">Request Type</p>
                        <p className="font-semibold text-gray-900">
                          {item.queueType === "newMember" ? "New Member" : "Member Update"}
                        </p>
                        <p className="text-sm text-gray-600 mt-3">Member Name</p>
                        <p className="text-gray-900">{item.memberData?.name || "N/A"}</p>
                        <p className="text-sm text-gray-600 mt-3">Mobile</p>
                        <p className="text-gray-900">{item.memberData?.mobileNumber || item.requester?.mobileNumber}</p>
                        <p className="text-sm text-gray-600 mt-3">Payment Status</p>
                        <p className="text-gray-900">{item.memberData?.paymentStatus ? "Paid" : "Pending"}</p>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Approved Items */}
          {approvedItems.length > 0 && (
            <div className="bg-white rounded-lg shadow overflow-x-auto">
              <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-800">
                  Approved Requests ({approvedItems.length})
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Requested By</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Approved At</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Approved By</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {approvedItems.map((item) => (
                      <tr key={item.key}>
                        <td className="px-4 py-4 text-sm text-gray-700">{item.requester?.name}</td>
                        <td className="px-4 py-4 text-sm">
                          {item.queueType === "newMember" ? "New Member" : item.queueType === "memberEdit" ? "Member Edit" : "Member Update"}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-500">
                          {item.approvedAt ? new Date(item.approvedAt).toLocaleString("en-IN") : "-"}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-700">{item.approvedBy || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}