"use client";
import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import ProtectedRoute from "../../components/ProtectedRoute";
import { getUserDoc } from "../../utils/getUserDoc";
import { useRouter } from "next/navigation";
import { db } from "../../firebase/config";
import { ref, get } from "firebase/database";
import { hasAccess, ROUTES, ALL_ADMIN_USER_TYPE_OPTIONS, DB_PATHS, dbPath } from "../../utils/constants";
import { useFinancialYear } from "../../context/FinancialYearContext";

interface UserRecord {
  key: string;
  name?: string;
  mobileNo?: string;
  userType?: string;
  email?: string;
  createdAt?: string;
}

interface MemberRecord {
  key: string;
  memberId?: string;
  name?: string;
  mobileNumber?: string | null;
  panNumber?: string;
  address?: string;
  emailId?: string;
}

export default function UserManagementPage() {
  const { user } = useAuth();
  const { selectedYear } = useFinancialYear();
  const router = useRouter();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Create user form
  const [name, setName] = useState("");
  const [mobileNo, setMobileNo] = useState("");
  const [selectedMember, setSelectedMember] = useState<MemberRecord | null>(null);
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState("");
  const [nameFocused, setNameFocused] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [userType, setUserType] = useState("GB");
  const [createMessage, setCreateMessage] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  // Reset password form
  const [resetMobileNo, setResetMobileNo] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetting, setResetting] = useState(false);

  // Users list
  const [usersList, setUsersList] = useState<UserRecord[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  useEffect(() => {
    if (!userData || !hasAccess(userData.userType)) return;

    let isCurrent = true;
    setMembersLoading(true);
    setMembersError("");
    setMembers([]);
    setSelectedMember(null);
    setName("");
    setMobileNo("");
    setMemberId("");

    get(ref(db, dbPath.members(selectedYear)))
      .then((snapshot) => {
        if (!isCurrent) return;
        if (!snapshot.exists()) {
          setMembers([]);
          return;
        }

        const data = snapshot.val() as Record<string, Omit<MemberRecord, "key">>;
        const memberList = Object.entries(data)
          .map(([key, member]) => ({ key, ...member }))
          .filter((member) => typeof member.name === "string" && member.name.trim())
          .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setMembers(memberList);
      })
      .catch((error: unknown) => {
        console.error("Error fetching members for user creation:", error);
        if (isCurrent) setMembersError("Could not load members. User creation is unavailable.");
      })
      .finally(() => {
        if (isCurrent) setMembersLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [userData, selectedYear]);

  useEffect(() => {
    if (user) {
      getUserDoc(user.uid)
        .then(data => {
          setUserData(data);
          if (data && data.userType !== "GB" && data.userType !== "Accounts") {
            setCreateError("You do not have permission to access this page.");
          } else {
            fetchUsers();
          }
        })
        .finally(() => setLoading(false));
    }
  }, [user]);

  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      const usersRef = ref(db, `${DB_PATHS.ROOT}/${DB_PATHS.USERS}`);
      const snap = await get(usersRef);
      if (snap.exists()) {
        const data = snap.val();
        const list: UserRecord[] = Object.keys(data).map(key => ({
          key,
          ...data[key],
        }));
        // Sort by name, then by createdAt descending
        list.sort((a, b) => {
          const nameA = (a.name || "").toLowerCase();
          const nameB = (b.name || "").toLowerCase();
          if (nameA !== nameB) return nameA.localeCompare(nameB);
          return (b.createdAt || "").localeCompare(a.createdAt || "");
        });
        setUsersList(list);
      } else {
        setUsersList([]);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setUsersLoading(false);
    }
  };

  const validateForm = (): boolean => {
    setCreateError("");
    setCreateMessage("");

    if (!name.trim()) {
      setCreateError("Name is required.");
      return false;
    }
    if (!selectedMember || selectedMember.name?.trim() !== name.trim()) {
      setCreateError("Select a name from the member list before creating a user.");
      return false;
    }
    if (!mobileNo.trim()) {
      setCreateError("Mobile number is required.");
      return false;
    }
    if (!/^\d{10}$/.test(mobileNo.trim())) {
      setCreateError("Mobile number must be a valid 10-digit number.");
      return false;
    }
    if (!userType) {
      setCreateError("User type is required.");
      return false;
    }
    return true;
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    const memberToCreate = selectedMember;
    if (!memberToCreate) return;

    setCreating(true);
    setCreateMessage("");
    setCreateError("");
    const email = `${mobileNo.trim()}@abs.com`;
    const password = "Test123";

    try {
      // Step 1: Create user in Firebase Auth using REST API
      const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
      const signUpRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email,
            password: password,
            returnSecureToken: true,
          }),
        }
      );

      const signUpData = await signUpRes.json();

      if (!signUpRes.ok) {
        if (signUpData.error?.message === "EMAIL_EXISTS") {
          setCreateError(`User with email ${email} already exists. Use the reset password feature if needed.`);
        } else {
          setCreateError(signUpData.error?.message || "Failed to create user in Firebase Auth.");
        }
        return;
      }

      const uid = signUpData.localId;

      // Step 2: Save user details to Realtime Database
      const saveRes = await fetch("/api/save-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid,
          name: name.trim(),
          mobileNo: mobileNo.trim(),
          userType: userType,
          email: email,
          memberId: memberToCreate.memberId || memberToCreate.key,
        }),
      });

      const saveData = await saveRes.json();

      if (!saveRes.ok) {
        setCreateError("User created in Auth but failed to save details: " + (saveData.error || "Unknown error"));
        return;
      }

      setCreateMessage(`User created successfully! Email: ${email}, Password: ${password}`);
      setName("");
      setMobileNo("");
      setSelectedMember(null);
      setMemberId("");
      setUserType("GB");

      // Refresh users list
      fetchUsers();
    } catch (err: any) {
      setCreateError("Failed to create user: " + (err.message || "Unknown error"));
    } finally {
      setCreating(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError("");
    setResetMessage("");
    setResetting(true);

    try {
      const email = `${resetMobileNo}@abs.com`;
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setResetError(data.error || "Failed to reset password.");
        return;
      }

      setResetMessage(data.message || `Password reset successfully to Test123 for ${resetMobileNo}@abs.com`);
      setResetMobileNo("");
    } catch (err: any) {
      setResetError("Failed to reset password: " + (err.message || "Unknown error"));
    } finally {
      setResetting(false);
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

  const matchingMembers = name.trim()
    ? members.filter((member) => member.name?.toLowerCase().includes(name.trim().toLowerCase())).slice(0, 8)
    : [];

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
            <p className="text-gray-600">Only GB and Accounts users can access user management.</p>
            <button
              onClick={() => router.push(ROUTES.DASHBOARD)}
              className="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 py-6 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold text-gray-800">User Management</h1>
            <button
              onClick={() => router.push(ROUTES.DASHBOARD)}
              className="text-sm text-blue-600 hover:text-blue-800 transition"
            >
              &larr; Back to Dashboard
            </button>
          </div>

          <div className="space-y-6">
            {/* Create User Section */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="px-5 py-3.5 bg-blue-50 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-800">Create New User</h2>
              </div>
              <div className="p-5">
                <form onSubmit={handleCreateUser} className="space-y-4">
                  {createError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
                      {createError}
                    </div>
                  )}
                  {createMessage && (
                    <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded text-sm whitespace-pre-line">
                      {createMessage}
                    </div>
                  )}

                  <div>
                    <label className="block mb-1 font-medium text-gray-700">Name *</label>
                    <div className="relative">
                      <input
                        type="text"
                        className="w-full border px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Search member by name"
                        value={name}
                        onFocus={() => setNameFocused(true)}
                        onBlur={() => setNameFocused(false)}
                        onChange={e => {
                          setName(e.target.value);
                          setSelectedMember(null);
                          setMobileNo("");
                          setMemberId("");
                          setCreateError("");
                        }}
                        autoComplete="off"
                        role="combobox"
                        aria-autocomplete="list"
                        aria-expanded={nameFocused && matchingMembers.length > 0}
                        aria-controls="user-member-suggestions"
                        required
                      />
                      {nameFocused && matchingMembers.length > 0 && (
                        <ul
                          id="user-member-suggestions"
                          role="listbox"
                          className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border border-gray-300 bg-white py-1 shadow-lg"
                        >
                          {matchingMembers.map(member => (
                            <li key={member.key} role="option" aria-selected={selectedMember?.key === member.key}>
                              <button
                                type="button"
                                onMouseDown={event => event.preventDefault()}
                                onClick={() => {
                                  setSelectedMember(member);
                                  setName(member.name?.trim() || "");
                                  setMobileNo((member.mobileNumber || "").replace(/\D/g, "").slice(0, 10));
                                  setMemberId(member.memberId || member.key);
                                  setNameFocused(false);
                                  setCreateError("");
                                }}
                                className="w-full px-3 py-2 text-left hover:bg-blue-50"
                              >
                                <span className="block text-sm font-medium text-gray-800">{member.name}</span>
                                <span className="block text-xs text-gray-500">
                                  {member.memberId ? `Member ID: ${member.memberId}` : "Member"}{member.mobileNumber ? ` · Mobile: ${member.mobileNumber}` : ""}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {membersLoading && <p className="mt-1 text-xs text-gray-500">Loading members for {selectedYear}...</p>}
                    {membersError && <p className="mt-1 text-xs text-red-600">{membersError}</p>}
                    {nameFocused && name.trim() && !membersLoading && !membersError && matchingMembers.length === 0 && (
                      <p className="mt-1 text-xs text-red-600">No matching member found. Only existing members can be created as users.</p>
                    )}
                  </div>

                  <div>
                    <label className="block mb-1 font-medium text-gray-700">Mobile Number *</label>
                    <input
                      type="tel"
                      className="w-full border px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="10-digit mobile number"
                      value={mobileNo}
                      onChange={e => setMobileNo(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      required
                    />
                    {memberId && <p className="mt-1 text-xs text-gray-500">Member ID: {memberId}</p>}
                    <p className="text-xs text-gray-500 mt-1">
                      User ID will be: {mobileNo || "1231231231"}, Password: Test123
                    </p>
                  </div>

                  <div>
                    <label className="block mb-1 font-medium text-gray-700">User Type *</label>
                    <select
                      className="w-full border px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={userType}
                      onChange={e => setUserType(e.target.value)}
                      required
                    >
                      {ALL_ADMIN_USER_TYPE_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-blue-600 text-white py-2.5 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium transition-colors duration-200 disabled:opacity-50"
                    disabled={creating || membersLoading || !!membersError || !selectedMember}
                  >
                    {creating ? "Creating User..." : "Create User"}
                  </button>
                </form>
              </div>
            </div>

            {/* Users List Section */}
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
                  disabled={usersLoading}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${usersLoading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh
                </button>
              </div>
              <div className="p-5">
                {usersLoading ? (
                  <div className="text-center py-8">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-500 border-t-transparent"></div>
                    <p className="mt-2 text-gray-500 text-sm">Loading users...</p>
                  </div>
                ) : usersList.length === 0 ? (
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
                          <th className="text-left py-3 px-4 font-medium text-gray-700">Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usersList.map((u) => (
                          <tr
                            key={u.key}
                            onClick={() => router.push(`/user-management/${u.key}`)}
                            className="border-b border-gray-100 hover:bg-indigo-50 cursor-pointer transition-colors"
                          >
                            <td className="py-3 px-4 font-medium text-gray-900">{u.name || "-"}</td>
                            <td className="py-3 px-4 text-gray-600">{u.mobileNo || "-"}</td>
                            <td className="py-3 px-4 text-gray-600">{u.email || "-"}</td>
                            <td className="py-3 px-4">
                              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${getUserTypeBadgeClass(u.userType)}`}>
                                {u.userType || "-"}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-gray-500 text-xs">
                              {u.createdAt ? new Date(u.createdAt).toLocaleDateString("en-IN") : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Reset Password Section */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="px-5 py-3.5 bg-orange-50 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-800">Reset User Password</h2>
              </div>
              <div className="p-5">
                <form onSubmit={handleResetPassword} className="space-y-4">
                  {resetError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
                      {resetError}
                    </div>
                  )}
                  {resetMessage && (
                    <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded text-sm">
                      {resetMessage}
                    </div>
                  )}

                  <div>
                    <label className="block mb-1 font-medium text-gray-700">User Mobile Number</label>
                    <input
                      type="tel"
                      className="w-full border px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="Enter 10-digit mobile number"
                      value={resetMobileNo}
                      onChange={e => setResetMobileNo(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Password will be reset to: Test123
                    </p>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-orange-600 text-white py-2.5 rounded-md hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 font-medium transition-colors duration-200 disabled:opacity-50"
                    disabled={resetting}
                  >
                    {resetting ? "Resetting Password..." : "Reset Password"}
                  </button>
                </form>
              </div>
            </div>

            {/* Info Section */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-800">User Type Reference</h2>
              </div>
              <div className="p-5">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b">
                      <th className="py-2 pr-4 font-medium text-gray-700">User Type</th>
                      <th className="py-2 font-medium text-gray-700">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-100">
                      <td className="py-2 pr-4 font-semibold text-gray-800">GB</td>
                      <td className="py-2 text-gray-600">Full access to all features</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-2 pr-4 font-semibold text-gray-800">Accounts</td>
                      <td className="py-2 text-gray-600">Full access to all features</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-2 pr-4 font-semibold text-gray-800">Front Office</td>
                      <td className="py-2 text-gray-600">Limited access (Spot Collection, Members)</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-semibold text-gray-800">Member</td>
                      <td className="py-2 text-gray-600">Restricted access (view-only)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}