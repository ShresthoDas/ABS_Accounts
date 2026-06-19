"use client";
import { useAuth } from "../../context/AuthContext";
import ProtectedRoute from "../../components/ProtectedRoute";
import { useEffect, useState } from "react";
import { getUserDoc } from "../../utils/getUserDoc";
import { useRouter } from "next/navigation";
import { db } from "../../firebase/config";
import { ref, get, push, set } from "firebase/database";
import { dbPath, getCurrentYearString } from "../../utils/constants";
import { useFinancialYear } from "../../context/FinancialYearContext";
import { logAudit } from "../../utils/auditLog";

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

interface FormData {
  name: string;
  mobileNumber: string;
  panNumber: string;
  secondaryMemberName: string;
  address: string;
  emailId: string;
}

export default function MemberLandingPage() {
  const { user, logout } = useAuth();
  const { selectedYear } = useFinancialYear();
  const [userData, setUserData] = useState<any>(null);
  const [member, setMember] = useState<MemberItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<FormData>({
    name: "",
    mobileNumber: "",
    panNumber: "",
    secondaryMemberName: "",
    address: "",
    emailId: "",
  });
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
            const foundMember = {
              key,
              ...memberItem,
            };
            setMember(foundMember);
            // Initialize form data from member
            setFormData({
              name: memberItem.name || "",
              mobileNumber: memberItem.mobileNumber || "",
              panNumber: memberItem.panNumber || "",
              secondaryMemberName: memberItem.secondaryMemberName || "",
              address: memberItem.address || "",
              emailId: memberItem.emailId || "",
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

  const handleEditToggle = () => {
    setSubmitSuccess("");
    setErrors({});
    if (!isEditing && member) {
      // Reset form to current member data
      setFormData({
        name: member.name || "",
        mobileNumber: member.mobileNumber || "",
        panNumber: member.panNumber || "",
        secondaryMemberName: member.secondaryMemberName || "",
        address: member.address || "",
        emailId: member.emailId || "",
      });
    }
    setIsEditing(!isEditing);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear error for this field
    if (errors[name]) {
      setErrors((prev) => {
        const updated = { ...prev };
        delete updated[name];
        return updated;
      });
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Name is mandatory";
    }

    if (!formData.emailId.trim()) {
      newErrors.emailId = "Email ID is mandatory";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.emailId)) {
      newErrors.emailId = "Please enter a valid email address";
    }

    if (!formData.panNumber.trim()) {
      newErrors.panNumber = "PAN Number is mandatory";
    }

    if (!formData.address.trim()) {
      newErrors.address = "Address is mandatory";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    if (!user || !userData || !member) return;

    setSaving(true);
    setSubmitSuccess("");
    setErrors({});

    try {
      const now = new Date().toISOString();

      // Build the updated member data
      const updatedData = {
        name: formData.name.trim(),
        mobileNumber: formData.mobileNumber.trim() || null,
        panNumber: formData.panNumber.trim().toUpperCase(),
        secondaryMemberName: formData.secondaryMemberName.trim() || null,
        address: formData.address.trim(),
        emailId: formData.emailId.trim(),
      };

      // Store previous data for audit
      const previousData = {
        name: member.name,
        mobileNumber: member.mobileNumber,
        panNumber: member.panNumber,
        secondaryMemberName: member.secondaryMemberName,
        address: member.address,
        emailId: member.emailId,
      };

      // Create approval queue entry
      const queueRef = push(ref(db, dbPath.unAuthQueue));
      const queueKey = queueRef.key;

      await set(queueRef, {
        queueType: "memberEdit",
        status: "pending",
        requestedAt: now,
        requester: {
          uid: user.uid,
          name: userData.name || "Unknown",
          mobileNumber: userData.mobileNo || "",
          userType: userData.userType || "Member",
          email: user.email || "",
        },
        memberData: updatedData,
        memberPreviousData: previousData,
        targetYear: selectedYear,
        originalMemberKey: member.key,
        originalMemberId: member.memberId,
        reviewed: false,
      });

      // Log audit for the edit request
      await logAudit({
        action: "UPDATE",
        entityType: "Member",
        entityId: member.key,
        previousData: previousData,
        newData: { ...updatedData, _pendingApproval: true, _queueKey: queueKey as string },
        changedBy: userData.name || user.email || "Unknown",
        changedByUid: user.uid || "",
        changedAt: now,
      });

      setSubmitSuccess("Your changes have been submitted for approval. An admin will review them shortly.");
      setIsEditing(false);
    } catch (error) {
      console.error("Error submitting edit request:", error);
      alert("Error submitting your changes. Please try again.");
    } finally {
      setSaving(false);
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

  const allowedTypes = ["GB", "Accounts", "Front Office", "Member"];
  const isAllowed = userData?.userType && allowedTypes.includes(userData.userType);

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div>Loading...</div>
        </div>
      </ProtectedRoute>
    );
  }

  if (!isAllowed) {
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
                This page is only accessible to members and admin users.
              </p>
              <p className="text-yellow-600 text-sm">
                Your account type is <strong>{userData?.userType || "Unknown"}</strong>. Only users with the <strong>GB</strong>, <strong>Accounts</strong>, <strong>Front Office</strong>, or <strong>Member</strong> roles can view member details here.
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

  // Render the main member view
  const renderDetailView = () => (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      {/* Header */}
      <div className="bg-indigo-500 text-white p-6 flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold">{member!.name}</h2>
          <p className="text-indigo-100 mt-1">
            {member!.memberId && <span>Member ID: {member!.memberId}</span>}
            {member!.date && (
              <span className="ml-4">
                Joined: {new Date(member!.date).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric'
                })}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={handleEditToggle}
          className="flex items-center gap-2 bg-white text-indigo-600 px-4 py-2 rounded-md hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-white font-medium text-sm transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Edit Details
        </button>
      </div>

      {/* Details */}
      <div className="p-6 space-y-6">
        {/* Personal Information */}
        <div>
          <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">Personal Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Name</p>
              <p className="text-base font-medium text-gray-900">{member!.name}</p>
            </div>
            {member!.secondaryMemberName && (
              <div>
                <p className="text-sm text-gray-500">Secondary Member</p>
                <p className="text-base font-medium text-gray-900">{member!.secondaryMemberName}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-gray-500">Mobile Number</p>
              <p className="text-base font-medium text-gray-900">{member!.mobileNumber || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">PAN Number</p>
              <p className="text-base font-medium text-gray-900">{member!.panNumber || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Email ID</p>
              <p className="text-base font-medium text-gray-900">{member!.emailId || '-'}</p>
            </div>
            {member!.address && (
              <div className="md:col-span-2">
                <p className="text-sm text-gray-500">Address</p>
                <p className="text-base font-medium text-gray-900">{member!.address}</p>
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
              {member!.paymentStatus ? (
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
            {member!.amount && (
              <div>
                <p className="text-sm text-gray-500">Amount</p>
                <p className="text-base font-medium text-gray-900">
                  ₹ {parseFloat(member!.amount).toLocaleString('en-IN', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </p>
              </div>
            )}
            {member!.receiptNumber && (
              <div>
                <p className="text-sm text-gray-500">Receipt Number</p>
                <p className="text-base font-medium text-gray-900">{member!.receiptNumber}</p>
              </div>
            )}
            {member!.modeOfPayment && (
              <div>
                <p className="text-sm text-gray-500">Mode of Payment</p>
                <p className="text-base font-medium text-gray-900">{member!.modeOfPayment}</p>
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
              <p className="text-base font-medium text-gray-900">{member!.inputBy || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Created At</p>
              <p className="text-base font-medium text-gray-900">
                {member!.createdAt
                  ? new Date(member!.createdAt).toLocaleString('en-IN')
                  : '-'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Render the edit form
  const renderEditForm = () => (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      {/* Header */}
      <div className="bg-amber-500 text-white p-6 flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold">Edit My Details</h2>
          <p className="text-amber-100 mt-1">
            Changes will be submitted for admin approval
          </p>
        </div>
        <button
          onClick={handleEditToggle}
          className="flex items-center gap-2 bg-white text-amber-600 px-4 py-2 rounded-md hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-white font-medium text-sm transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Cancel
        </button>
      </div>

      {/* Success Message */}
      {submitSuccess && (
        <div className="mx-6 mt-6 rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-800 flex items-start gap-3">
          <svg className="w-5 h-5 text-green-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{submitSuccess}</span>
        </div>
      )}

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Name - Mandatory */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 ${errors.name ? "border-red-500" : "border-gray-300"}`}
              placeholder="Enter your name"
            />
            {errors.name && <p className="mt-1 text-sm text-red-500">{errors.name}</p>}
          </div>

          {/* Mobile Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mobile Number
            </label>
            <input
              type="tel"
              name="mobileNumber"
              value={formData.mobileNumber}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="Enter mobile number"
              maxLength={10}
            />
          </div>

          {/* PAN Number - Mandatory */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              PAN Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="panNumber"
              value={formData.panNumber}
              onChange={(e) => {
                const updated = { ...formData, panNumber: e.target.value.toUpperCase() };
                setFormData(updated);
                if (errors.panNumber) {
                  setErrors((prev) => { const c = { ...prev }; delete c.panNumber; return c; });
                }
              }}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 ${errors.panNumber ? "border-red-500" : "border-gray-300"}`}
              placeholder="Enter PAN number"
              maxLength={10}
            />
            {errors.panNumber && <p className="mt-1 text-sm text-red-500">{errors.panNumber}</p>}
          </div>

          {/* Secondary Member Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Secondary Member Name
            </label>
            <input
              type="text"
              name="secondaryMemberName"
              value={formData.secondaryMemberName}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="Enter secondary member name (if any)"
            />
          </div>

          {/* Email ID - Mandatory */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email ID <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              name="emailId"
              value={formData.emailId}
              onChange={handleInputChange}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 ${errors.emailId ? "border-red-500" : "border-gray-300"}`}
              placeholder="Enter email address"
            />
            {errors.emailId && <p className="mt-1 text-sm text-red-500">{errors.emailId}</p>}
          </div>

          {/* Address - Mandatory (full width) */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Address <span className="text-red-500">*</span>
            </label>
            <textarea
              name="address"
              rows={3}
              value={formData.address}
              onChange={handleInputChange}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 ${errors.address ? "border-red-500" : "border-gray-300"}`}
              placeholder="Enter your address"
            />
            {errors.address && <p className="mt-1 text-sm text-red-500">{errors.address}</p>}
          </div>
        </div>

        {/* Submit Button */}
        <div className="border-t pt-5">
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 bg-amber-600 text-white px-6 py-3 rounded-md hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Submitting...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Submit for Approval
                </>
              )}
            </button>
            <p className="text-xs text-gray-500">
              Your current details will remain visible until an admin approves your changes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-3xl mx-auto">
          {/* Header with Logout */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold text-gray-800">{isEditing ? "Edit My Membership" : "My Membership"}</h1>
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

          {isEditing ? renderEditForm() : renderDetailView()}
        </div>
      </div>
    </ProtectedRoute>
  );
}