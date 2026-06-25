"use client";
import { useAuth } from "../../../context/AuthContext";
import ProtectedRoute from "../../../components/ProtectedRoute";
import { useEffect, useState } from "react";
import { getUserDoc } from "../../../utils/getUserDoc";
import { useRouter, useParams } from "next/navigation";
import { db } from "../../../firebase/config";
import { ref, get } from "firebase/database";
import { logAudit } from "../../../utils/auditLog";
import { hasAccess, ROUTES, DB_PATHS } from "../../../utils/constants";

interface UserDetail {
  key: string;
  name?: string;
  mobileNo?: string;
  userType?: string;
  email?: string;
  memberId?: string | null;
  createdAt?: string;
}

export default function UserDetailPage() {
  const { user } = useAuth();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState("");
  const [resetError, setResetError] = useState("");
  const [usersList, setUsersList] = useState<UserDetail[]>([]);
  const router = useRouter();
  const params = useParams();

  useEffect(() => {
    if (user) {
      getUserDoc(user.uid)
        .then((data) => setUserData(data))
        .finally(() => setLoading(false));
    }
  }, [user]);

  const fetchUsers = async () => {
    try {
      const usersRef = ref(db, `${DB_PATHS.ROOT}/${DB_PATHS.USERS}`);
      const snap = await get(usersRef);
      if (snap.exists()) {
        const data = snap.val();
        const list: UserDetail[] = Object.keys(data).map(key => ({
          key,
          ...data[key],
        }));
        list.sort((a, b) => {
          const nameA = (a.name || "").toLowerCase();
          const nameB = (b.name || "").toLowerCase();
          if (nameA !== nameB) return nameA.localeCompare(nameB);
          return (b.createdAt || "").localeCompare(a.createdAt || "");
        });
        setUsersList(list);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  const fetchUserDetail = async () => {
    try {
      setLoading(true);
      const snap = await get(ref(db, `${DB_PATHS.ROOT}/${DB_PATHS.USERS}/${params.id}`));
      if (snap.exists()) {
        const d = snap.val();
        setUserDetail({ key: params.id as string, ...d });
      } else {
        setUserDetail(null);
      }
    } catch (error) {
      console.error("Error fetching user:", error);
      setUserDetail(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userData && params.id) {
      fetchUserDetail();
      fetchUsers();
    }
  }, [userData, params.id]);

  // If params.id is not a valid UID (e.g. not in users list), treat as user listing mode
  const isUserListMode = params.id === "list" || (usersList.length > 0 && !userDetail && !loading);

  const handleResetPassword = async () => {
    if (!userDetail?.email) {
      setResetError("User has no email address to reset password.");
      return;
    }

    setResetError("");
    setResetMessage("");
    setResetting(true);

    try {
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userDetail.email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setResetError(data.error || "Failed to reset password.");
        return;
      }

      setResetMessage(`Password reset successfully to Test123 for ${userDetail.email}`);
    } catch (err: any) {
      setResetError("Failed to reset password: " + (err.message || "Unknown error"));
    } finally {
      setResetting(false);
    }
  };

  const handleDelete = async () => {
    if (!userDetail || !userData || !user) return;
    setDeleting(true);

    try {
      const res = await fetch("/api/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: params.id }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert("Failed to delete user: " + (data.error || "Unknown error"));
        return;
      }

      await logAudit({
        action: "DELETE",
        entityType: "User",
        entityId: params.id as string,
        previousData: userDetail,
        newData: null,
        changedBy: userData.name || user.email || "Unknown",
        changedByUid: user.uid,
        changedAt: new Date().toISOString(),
      });

      alert("User deleted successfully!");
      router.push(ROUTES.USER_MANAGEMENT);
    } catch (err: any) {
      console.error("Error deleting user:", err);
      alert("Error deleting user. Please try again.");
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleDeleteByKey = async (key: string, name: string, email: string) => {
    if (!userData || !user) return;
    if (!confirm(`Are you sure you want to delete user "${name}" (${email})?\n\nThis will permanently delete the user from Firebase Authentication and the database. This action cannot be undone.`)) return;

    try {
      const res = await fetch("/api/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: key }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert("Failed to delete user: " + (data.error || "Unknown error"));
        return;
      }

      await logAudit({
        action: "DELETE",
        entityType: "User",
        entityId: key,
        previousData: { key, name, email },
        newData: null,
        changedBy: userData.name || user.email || "Unknown",
        changedByUid: user.uid,
        changedAt: new Date().toISOString(),
      });

      alert("User deleted successfully!");
      fetchUsers();
    } catch (err: any) {
      console.error("Error deleting user:", err);
      alert("Error deleting user. Please try again.");
    }
  };

  const getUserTypeBadgeClass = (type: string | undefined) => {
    switch (type) {
      case "GB": return "bg-purple-100 text-purple-800";
      case "Accounts": return "bg-blue-100 text-blue-800";
      case "Front Office": return "bg-green-100 text-green-800";
      case "Member": return "bg-gray-100 text-gray-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const canAccess = userData && hasAccess(userData.userType);

  // Render users list
  const renderUsersList = () => (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="px-5 py-3.5 bg-indigo-50 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">
          All Users
          {usersList.length > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-500">({usersList.length} total)</span>
          )}
        </h2>
        <button
          onClick={fetchUsers}
          className="text-sm text-indigo-600 hover:text-indigo-800 transition flex items-center gap-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>
      <div className="p-5">
        {usersList.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No users found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Name</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Mobile</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Email</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">User Type</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {usersList.map((u) => (
                  <tr key={u.key} className="border-b border-gray-100 hover:bg-indigo-50 transition-colors">
                    <td
                      className="py-3 px-4 font-medium text-gray-900 cursor-pointer hover:text-indigo-600"
                      onClick={() => router.push(`/user-management/${u.key}`)}
                    >
                      {u.name || "-"}
                    </td>
                    <td className="py-3 px-4 text-gray-600">{u.mobileNo || "-"}</td>
                    <td className="py-3 px-4 text-gray-600">{u.email || "-"}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${getUserTypeBadgeClass(u.userType)}`}>
                        {u.userType || "-"}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => router.push(`/user-management/${u.key}`)}
                          className="text-xs bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded hover:bg-indigo-200 transition"
                        >
                          View
                        </button>
                        <button
                          onClick={() => handleDeleteByKey(u.key, u.name || "Unnamed", u.email || "No email")}
                          className="text-xs bg-red-100 text-red-700 px-2.5 py-1 rounded hover:bg-red-200 transition"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

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
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md"><p className="font-medium">Access Denied</p><p className="text-sm">You do not have permission to view this page.</p></div>
            <button onClick={() => router.push(ROUTES.DASHBOARD)} className="mt-4 text-blue-600 hover:text-blue-800">← Back to Dashboard</button>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  if (!userDetail) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 py-8 px-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-3xl font-bold text-gray-800">User Management</h1>
              <button onClick={() => router.push(ROUTES.USER_MANAGEMENT)} className="text-sm text-blue-600 hover:text-blue-800 transition">← Back</button>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-md mb-6">User not found.</div>
            {renderUsersList()}
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center mb-6">
            <button onClick={() => router.push(ROUTES.USER_MANAGEMENT)} className="mr-4 text-blue-600 hover:text-blue-800">← Back to User Management</button>
            <h1 className="text-3xl font-bold">User Details</h1>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 mb-6">
            <button
              onClick={handleResetPassword}
              disabled={resetting}
              className="flex items-center gap-2 bg-orange-600 text-white px-5 py-2.5 rounded-md hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 font-medium disabled:opacity-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              {resetting ? "Resetting Password..." : "Reset Password"}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 bg-red-600 text-white px-5 py-2.5 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 font-medium"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete User
            </button>
          </div>

          {/* Reset Password Messages */}
          {resetError && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{resetError}</div>
          )}
          {resetMessage && (
            <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded text-sm">{resetMessage}</div>
          )}

          {/* User Detail Card */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="bg-indigo-500 text-white p-6">
              <h2 className="text-2xl font-bold">{userDetail.name || "Unnamed User"}</h2>
              <p className="text-indigo-100 mt-1">
                {userDetail.email || "No email"}
              </p>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">User Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Name</p>
                    <p className="text-base font-medium text-gray-900">{userDetail.name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Mobile Number</p>
                    <p className="text-base font-medium text-gray-900">{userDetail.mobileNo || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Email</p>
                    <p className="text-base font-medium text-gray-900">{userDetail.email || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">User Type</p>
                    <p className="text-base font-medium text-gray-900">
                      <span className={`inline-flex px-2 py-0.5 rounded text-sm font-medium ${getUserTypeBadgeClass(userDetail.userType)}`}>
                        {userDetail.userType || '-'}
                      </span>
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Member ID</p>
                    <p className="text-base font-medium text-gray-900">{userDetail.memberId || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Created At</p>
                    <p className="text-base font-medium text-gray-900">
                      {userDetail.createdAt ? new Date(userDetail.createdAt).toLocaleString('en-IN') : '-'}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">Account Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">UID</p>
                    <p className="text-base font-medium text-gray-900 text-xs break-all">{userDetail.key}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Delete Confirmation Modal */}
          {showDeleteConfirm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Confirm Delete User</h2>
                <p className="text-gray-600 mb-2">Are you sure you want to delete this user?</p>
                <p className="text-sm text-red-600 mb-6">
                  User: <strong>{userDetail.name || "Unnamed"}</strong> ({userDetail.email || "No email"})
                  <br />
                  This will permanently delete the user from Firebase Authentication and the database.
                  This action cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 font-medium disabled:opacity-50"
                  >
                    {deleting ? "Deleting..." : "Yes, Delete"}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={deleting}
                    className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}