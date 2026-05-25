"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../firebase/config";
import { ref, get, push, set } from "firebase/database";
import {
  ALL_SIGNUP_USER_TYPE_OPTIONS,
  dbPath,
  DEFAULTS,
  getCurrentYearString,
  PAYMENT_MODES,
  requiresReferenceNumber,
  ROUTES,
} from "../../utils/constants";

type SignUpStep = "select" | "newMember" | "verifyMember";

type SignUpUserType = (typeof ALL_SIGNUP_USER_TYPE_OPTIONS)[number]["value"];

interface MemberFormState {
  memberId: string;
  name: string;
  mobileNumber: string;
  panNumber: string;
  secondaryMemberName: string;
  address: string;
  emailId: string;
  paymentStatus: boolean;
  modeOfPayment: string;
  chequeNumber: string;
  amount: string;
}

const defaultMemberFormState: MemberFormState = {
  memberId: "",
  name: "",
  mobileNumber: "",
  panNumber: "",
  secondaryMemberName: "",
  address: "",
  emailId: "",
  paymentStatus: false,
  modeOfPayment: "",
  chequeNumber: "",
  amount: DEFAULTS.MEMBER_AMOUNT,
};

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [userType, setUserType] = useState<SignUpUserType>("GB");
  const [step, setStep] = useState<SignUpStep>("select");
  const [memberForm, setMemberForm] = useState<MemberFormState>(defaultMemberFormState);
  const [queueMessage, setQueueMessage] = useState("");
  const [queueError, setQueueError] = useState("");
  const [searchError, setSearchError] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [memberFoundKey, setMemberFoundKey] = useState<string | null>(null);

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    setQueueMessage("");
    setQueueError("");
    setSearchError("");

    if (!name.trim()) {
      setQueueError("Name is required.");
      return;
    }

    if (!/^\d{10}$/.test(mobile.trim())) {
      setQueueError("Mobile number must be a valid 10-digit number.");
      return;
    }

    if (userType === "New Member") {
      setMemberForm({
        ...defaultMemberFormState,
        name: name.trim(),
        mobileNumber: mobile.trim(),
      });
      setStep("newMember");
      return;
    }

    setIsSearching(true);
    try {
      const currentYear = getCurrentYearString();
      const membersRef = ref(db, dbPath.members(currentYear));
      const snapshot = await get(membersRef);
      if (!snapshot.exists()) {
        setSearchError("No member records are available in the current year.");
        return;
      }

      const data = snapshot.val();
      const found = Object.entries(data).find(([, value]) => {
        const member = value as any;
        return String(member.mobileNumber || "").trim() === mobile.trim();
      });

      if (!found) {
        setSearchError("Member not found for this mobile number. Please verify the mobile number or choose New Member.");
        return;
      }

      const [key, member] = found as [string, any];
      setMemberFoundKey(key);
      setMemberForm({
        memberId: member.memberId || "",
        name: member.name || name.trim(),
        mobileNumber: member.mobileNumber || mobile.trim(),
        panNumber: member.panNumber || "",
        secondaryMemberName: member.secondaryMemberName || "",
        address: member.address || "",
        emailId: member.emailId || "",
        paymentStatus: member.paymentStatus || false,
        modeOfPayment: member.modeOfPayment || "",
        chequeNumber: member.chequeNumber || "",
        amount: member.amount?.toString() || DEFAULTS.MEMBER_AMOUNT,
      });
      setStep("verifyMember");
    } catch (error) {
      console.error("Search error:", error);
      setSearchError("Failed to search members. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  const validateMemberForm = () => {
    if (!memberForm.name.trim()) {
      setQueueError("Member name is mandatory.");
      return false;
    }

    if (!memberForm.panNumber.trim()) {
      setQueueError("PAN Number is mandatory.");
      return false;
    }

    if (!memberForm.address.trim()) {
      setQueueError("Address is mandatory.");
      return false;
    }

    if (!memberForm.emailId.trim()) {
      setQueueError("Email ID is mandatory.");
      return false;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(memberForm.emailId)) {
      setQueueError("Please enter a valid email address.");
      return false;
    }

    if (memberForm.paymentStatus) {
      if (!memberForm.modeOfPayment) {
        setQueueError("Please select a mode of payment.");
        return false;
      }
      if (requiresReferenceNumber(memberForm.modeOfPayment) && !memberForm.chequeNumber.trim()) {
        setQueueError(`Cheque / reference number is required for ${memberForm.modeOfPayment}.`);
        return false;
      }
      if (!memberForm.amount.trim() || isNaN(Number(memberForm.amount))) {
        setQueueError("Please enter a valid amount.");
        return false;
      }
    }

    return true;
  };

  const handleSubmitQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    setQueueMessage("");
    setQueueError("");

    if (!validateMemberForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const currentYear = getCurrentYearString();
      const queueRef = push(ref(db, dbPath.unAuthQueue));
      const queueKey = queueRef.key;

      const queueData = {
        key: queueKey,
        queueType: step === "newMember" ? "newMember" : "updateMember",
        requestedAt: new Date().toISOString(),
        status: "pending",
        requester: {
          name: name.trim(),
          mobileNumber: mobile.trim(),
          userType,
        },
        targetYear: currentYear,
        originalMemberKey: step === "verifyMember" ? memberFoundKey : null,
        memberType: userType,
        memberData: {
          ...memberForm,
          mobileNumber: mobile.trim(),
          amount: memberForm.paymentStatus ? parseFloat(memberForm.amount || "0") : 0,
          updatedAt: new Date().toISOString(),
        },
      };

      await set(queueRef, queueData);
      setQueueMessage("Your request has been submitted for admin approval. You will be notified once approved.");
      setStep("select");
      setName("");
      setMobile("");
      setUserType("GB");
      setMemberFoundKey(null);
      setMemberForm(defaultMemberFormState);
    } catch (error) {
      console.error("Queue submission error:", error);
      setQueueError("Failed to submit the request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderMemberForm = () => {
    return (
      <form onSubmit={handleSubmitQueue} className="space-y-6">
        <div className="space-y-4">
          <div>
            <label className="block mb-1 font-medium text-gray-700">Name</label>
            <input
              type="text"
              className="w-full border px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={memberForm.name}
              onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="block mb-1 font-medium text-gray-700">Mobile Number</label>
            <input
              type="tel"
              className="w-full border px-3 py-2 rounded bg-gray-100"
              value={memberForm.mobileNumber}
              readOnly
            />
          </div>

          <div>
            <label className="block mb-1 font-medium text-gray-700">PAN Number</label>
            <input
              type="text"
              className="w-full border px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={memberForm.panNumber}
              onChange={(e) => setMemberForm({ ...memberForm, panNumber: e.target.value.toUpperCase() })}
              required
            />
          </div>

          <div>
            <label className="block mb-1 font-medium text-gray-700">Secondary Member Name</label>
            <input
              type="text"
              className="w-full border px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={memberForm.secondaryMemberName}
              onChange={(e) => setMemberForm({ ...memberForm, secondaryMemberName: e.target.value })}
            />
          </div>

          <div>
            <label className="block mb-1 font-medium text-gray-700">Address</label>
            <textarea
              className="w-full border px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={memberForm.address}
              onChange={(e) => setMemberForm({ ...memberForm, address: e.target.value })}
              rows={3}
              required
            />
          </div>

          <div>
            <label className="block mb-1 font-medium text-gray-700">Email ID</label>
            <input
              type="email"
              className="w-full border px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={memberForm.emailId}
              onChange={(e) => setMemberForm({ ...memberForm, emailId: e.target.value })}
              required
            />
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={memberForm.paymentStatus}
                onChange={(e) => setMemberForm({ ...memberForm, paymentStatus: e.target.checked })}
              />
              <span className="text-gray-700">Payment received</span>
            </label>
          </div>

          {memberForm.paymentStatus && (
            <>
              <div>
                <label className="block mb-1 font-medium text-gray-700">Mode of Payment</label>
                <select
                  className="w-full border px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={memberForm.modeOfPayment}
                  onChange={(e) => setMemberForm({ ...memberForm, modeOfPayment: e.target.value })}
                  required
                >
                  <option value="">Select payment mode</option>
                  {Object.values(PAYMENT_MODES).map((mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  ))}
                </select>
              </div>

              {requiresReferenceNumber(memberForm.modeOfPayment) && (
                <div>
                  <label className="block mb-1 font-medium text-gray-700">Cheque / Reference Number</label>
                  <input
                    type="text"
                    className="w-full border px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={memberForm.chequeNumber}
                    onChange={(e) => setMemberForm({ ...memberForm, chequeNumber: e.target.value })}
                    required
                  />
                </div>
              )}

              <div>
                <label className="block mb-1 font-medium text-gray-700">Amount</label>
                <input
                  type="number"
                  className="w-full border px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={memberForm.amount}
                  onChange={(e) => setMemberForm({ ...memberForm, amount: e.target.value })}
                  required
                />
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            className="text-sm text-gray-600 hover:text-gray-900"
            onClick={() => setStep("select")}
          >
            &larr; Modify signup details
          </button>
          <button
            type="submit"
            className="bg-blue-600 text-white px-5 py-2 rounded hover:bg-blue-700 transition disabled:opacity-50"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Submitting request..." : "Submit for approval"}
          </button>
        </div>
      </form>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="px-6 py-6 sm:px-10 sm:py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Create User / Sign Up</h1>
              <p className="text-sm text-gray-500 mt-1">
                Start by entering your name, mobile number and role. If you select New Member, complete the member details next.
              </p>
            </div>
            <button
              type="button"
              className="text-sm text-blue-600 hover:text-blue-800"
              onClick={() => router.push("/login")}
            >
              Back to Login
            </button>
          </div>

          {queueMessage && (
            <div className="mb-4 rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-800">
              {queueMessage}
            </div>
          )}
          {queueError && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-800">
              {queueError}
            </div>
          )}

          {step === "select" ? (
            <form onSubmit={handleContinue} className="space-y-5">
              <div>
                <label className="block mb-1 font-medium text-gray-700">Name</label>
                <input
                  type="text"
                  className="w-full border px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block mb-1 font-medium text-gray-700">Mobile Number</label>
                <input
                  type="tel"
                  className="w-full border px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  maxLength={10}
                  required
                />
              </div>

              <div>
                <label className="block mb-1 font-medium text-gray-700">Member Type</label>
                <select
                  className="w-full border px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={userType}
                  onChange={(e) => setUserType(e.target.value as SignUpUserType)}
                >
                  {ALL_SIGNUP_USER_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
                disabled={isSearching}
              >
                {isSearching ? "Checking..." : "Continue"}
              </button>

              {searchError && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-800">
                  {searchError}
                </div>
              )}
            </form>
          ) : (
            <div>
              <div className="mb-5 rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800">
                {step === "newMember" ? (
                  <p>
                    You selected <strong>New Member</strong>. Please complete the membership form below. This request will be sent for admin approval.
                  </p>
                ) : (
                  <p>
                    We found an existing member record. Please verify the details below and submit the approval request.
                  </p>
                )}
              </div>
              {renderMemberForm()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
