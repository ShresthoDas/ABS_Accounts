"use client";
import { useAuth } from "../../context/AuthContext";
import ProtectedRoute from "../../components/ProtectedRoute";
import { useEffect, useState } from "react";
import { getUserDoc } from "../../utils/getUserDoc";
import { useRouter } from "next/navigation";
import { db } from "../../firebase/config";
import { ref, get } from "firebase/database";
import { dbPath } from "../../utils/constants";
import { useFinancialYear } from "../../context/FinancialYearContext";

interface MemberItem {
  key: string;
  memberId: string;
  name: string;
  paymentStatus: boolean;
  date?: string;
  mobileNumber?: string | null;
  panNumber?: string;
  secondaryMemberName?: string | null;
  address?: string;
  emailId?: string;
  modeOfPayment?: string;
  amount?: string;
  chequeNumber?: string | null;
  inputBy?: string;
  createdBy?: string;
  createdAt?: string;
  incomeKey?: string | null;
  receiptNumber?: string | null;
}

export default function MemberLandingPage() {
  const { user, logout } = useAuth();
  const { selectedYear } = useFinancialYear();
  const [userData, setUserData] = useState<any>(null);
  const [member, setMember] = useState<MemberItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (user) {
      getUserDoc(user.uid)
        .then((data) => {
          setUserData(data);
        })
        .catch(() => setLoading(false));
    }
  }, [user]);

  useEffect(() => {
    if (userData) {
      fetchMemberDetail();
    }
  }, [userData]);

  const fetchMemberDetail = async () => {
    try {
      const currentYear = selectedYear;
      const membersRef = ref(db, dbPath.members(currentYear));
      const snapshot = await get(membersRef);

      if (snapshot.exists()) {
        const membersData = snapshot.val();
        // Find the member whose memberId matches the logged-in user's memberId
        for (const key of Object.keys(membersData)) {
          const memberItem = membersData[key];
          if (memberItem.memberId === userData.memberId) {
            setMember({
              key,
              ...memberItem,
            });
            break;
          }
        }
      }
    } catch (error) {
      console.error("Error fetching member:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      await logout();
      router.push("/login");
    } catch (error) {
      console.error("Error logging out:", error);
    } finally {
      setLoggingOut(false);
    }
  };

  const isMember = userData?.userType === "Member";

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div>Loading...</div>
        </div>
      </ProtectedRoute>
    );
  }

  if (!isMember) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 py-8 px-4">
          <div className="max-w-4xl mx-auto">
            {/* Logout Button at top */}
            <div className="flex justify-end mb-4">
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 font-medium text-sm"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                {loggingOut ? "Logging out..." : "Logout"}
              </button>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-6 py-8 rounded-lg shadow-sm text-center">
              <div className="flex justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-yellow-800 mb-2">Access Restricted</h2>
              <p className="text-yellow-700 text-lg mb-2">
                This page is only accessible to members.
              </p>
              <p className="text-yellow-600 text-sm">
                Your account type is <strong>{userData?.userType || "Unknown"}</strong>. Only users with the <strong>Member</strong> role can view their details here.
              </p>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  if (!member) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 py-8 px-4">
          <div className="max-w-4xl mx-auto">
            {/* Logout Button at top */}
            <div className="flex justify-end mb-4">
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 font-medium text-sm"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                {loggingOut ? "Logging out..." : "Logout"}
              </button>
            </div>

            <div className="bg-white p-8 rounded-lg shadow-md text-center">
              <div className="flex justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">No Membership Record Found</h2>
              <p className="text-gray-600">
                We could not find a membership record associated with your Member ID: <strong>{userData?.memberId || "N/A"}</strong>.
              </p>
              <p className="text-gray-500 text-sm mt-2">
                Please contact the admin for assistance.
              </p>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-3xl mx-auto">
          {/* Header with Logout */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold text-gray-800">My Membership</h1>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 font-medium text-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              {loggingOut ? "Logging out..." : "Logout"}
            </button>
          </div>

          {/* Member Detail Card */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {/* Header */}
            <div className="bg-indigo-500 text-white p-6">
              <h2 className="text-2xl font-bold">{member.name}</h2>
              <p className="text-indigo-100 mt-1">
                {member.memberId && <span>Member ID: {member.memberId}</span>}
                {member.date && (
                  <span className="ml-4">
                    Joined: {new Date(member.date).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric'
                    })}
                  </span>
                )}
              </p>
            </div>

            {/* Details */}
            <div className="p-6 space-y-6">
              {/* Personal Information */}
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">Personal Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Name</p>
                    <p className="text-base font-medium text-gray-900">{member.name}</p>
                  </div>
                  {member.secondaryMemberName && (
                    <div>
                      <p className="text-sm text-gray-500">Secondary Member</p>
                      <p className="text-base font-medium text-gray-900">{member.secondaryMemberName}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-gray-500">Mobile Number</p>
                    <p className="text-base font-medium text-gray-900">{member.mobileNumber || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">PAN Number</p>
                    <p className="text-base font-medium text-gray-900">{member.panNumber || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Email ID</p>
                    <p className="text-base font-medium text-gray-900">{member.emailId || '-'}</p>
                  </div>
                  {member.address && (
                    <div className="md:col-span-2">
                      <p className="text-sm text-gray-500">Address</p>
                      <p className="text-base font-medium text-gray-900">{member.address}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Payment Information */}
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">Payment Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Payment Status</p>
                    {member.paymentStatus ? (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                        <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Paid
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                        <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                        Pending
                      </span>
                    )}
                  </div>
                  {member.amount && (
                    <div>
                      <p className="text-sm text-gray-500">Amount</p>
                      <p className="text-base font-medium text-gray-900">
                        ₹ {parseFloat(member.amount).toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </p>
                    </div>
                  )}
                  {member.receiptNumber && (
                    <div>
                      <p className="text-sm text-gray-500">Receipt Number</p>
                      <p className="text-base font-medium text-gray-900">{member.receiptNumber}</p>
                    </div>
                  )}
                  {member.modeOfPayment && (
                    <div>
                      <p className="text-sm text-gray-500">Mode of Payment</p>
                      <p className="text-base font-medium text-gray-900">{member.modeOfPayment}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Record Information */}
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">Record Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Input By</p>
                    <p className="text-base font-medium text-gray-900">{member.inputBy || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Created At</p>
                    <p className="text-base font-medium text-gray-900">
                      {member.createdAt
                        ? new Date(member.createdAt).toLocaleString('en-IN')
                        : '-'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}