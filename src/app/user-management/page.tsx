"use client";
import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import ProtectedRoute from "../../components/ProtectedRoute";
import { getUserDoc } from "../../utils/getUserDoc";
import { useRouter } from "next/navigation";
import { db } from "../../firebase/config";
import { ref, get } from "firebase/database";
import { hasAccess, ROUTES, ALL_USER_TYPE_OPTIONS } from "../../utils/constants";

export default function UserManagementPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Create user form
  const [name, setName] = useState("");
  const [mobileNo, setMobileNo] = useState("");
  const [userType, setUserType] = useState("GB");
  const [createMessage, setCreateMessage] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  // Reset password form
  const [resetEmail, setResetEmail] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (user) {
      getUserDoc(user.uid)
        .then(data => {
          setUserData(data);
          if (data && data.userType !== "GB" && data.userType !== "Accounts") {
            setCreateError("You do not have permission to access this page.");
          }
        })
        .finally(() => setLoading(false));
    }
  }, [user]);

  const validateForm = (): boolean => {
    setCreateError("");
    setCreateMessage("");

    if (!name.trim()) {
      setCreateError("Name is required.");
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
      const userRef = ref(db, `UAT/Accounts/Users/${uid}`);
      // We'll do this via a server-side API call to avoid permissions issues
      const saveRes = await fetch("/api/save-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid,
          name: name.trim(),
          mobileNo: mobileNo.trim(),
          userType: userType,
          email: email,
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
      setUserType("GB");
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
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setResetError(data.error || "Failed to reset password.");
        return;
      }

      setResetMessage(data.message || `Password reset successfully to Test123 for ${resetEmail.trim()}`);
      setResetEmail("");
    } catch (err: any) {
      setResetError("Failed to reset password: " + (err.message || "Unknown error"));
    } finally {
      setResetting(false);
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
        <div className="max-w-3xl mx-auto">
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
                    <input
                      type="text"
                      className="w-full border px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter full name"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      required
                    />
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
                    <p className="text-xs text-gray-500 mt-1">
                      User ID will be: {mobileNo ? `${mobileNo}@abs.com` : "mobile@abs.com"}, Password: Test123
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
                      {ALL_USER_TYPE_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-blue-600 text-white py-2.5 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium transition-colors duration-200 disabled:opacity-50"
                    disabled={creating}
                  >
                    {creating ? "Creating User..." : "Create User"}
                  </button>
                </form>
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
                    <label className="block mb-1 font-medium text-gray-700">User Email</label>
                    <input
                      type="email"
                      className="w-full border px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="Enter user's email (e.g. 1234567890@abs.com)"
                      value={resetEmail}
                      onChange={e => setResetEmail(e.target.value)}
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