"use client";
import { useAuth } from "../../../context/AuthContext";
import ProtectedRoute from "../../../components/ProtectedRoute";
import { useEffect, useState } from "react";
import { getUserDoc } from "../../../utils/getUserDoc";
import { useRouter, useParams } from "next/navigation";
import { db } from "../../../firebase/config";
import { ref, get, set, update, remove } from "firebase/database";
import { generateReceiptPDF } from "../../../utils/generateReceiptPDF";
import { logAudit } from "../../../utils/auditLog";
import { DEFAULTS } from "../../../utils/constants";

interface IncomeItem {
  key: string;
  date: string;
  receiptNumber: string;
  name: string;
  mobileNumber?: string | null;
  panNumber?: string;
  amount: number;
  category: string;
  modeOfPayment?: string;
  chequeNumber?: string | null;
  inputBy?: string;
  createdBy?: string;
  createdAt?: string;
  stallLink?: string;
  donationLink?: string;
}

type ModeOfPayment = "Cash" | "Cheque" | "NEFT";

export default function IncomeDetailPage() {
  const { user } = useAuth();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [income, setIncome] = useState<IncomeItem | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const isMembershipFee = income?.category === "Membership Fee";
  const isStallBooking = income?.category === DEFAULTS.STALL_INCOME_CATEGORY;
  const isDonationItem = income?.category === DEFAULTS.DONATION_INCOME_CATEGORY;
  const isDeleteDisabled = isMembershipFee || isStallBooking || isDonationItem;
  const router = useRouter();
  const params = useParams();

  // Edit form state
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [modeOfPayment, setModeOfPayment] = useState<ModeOfPayment | "">("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [inputBy, setInputBy] = useState("");

  const categoryOptions = [
    { value: "Donation", label: "Donation" },
    { value: "Membership Fee", label: "Membership Fee" },
    { value: "Event Income", label: "Event Income" },
    { value: "Interest Income", label: "Interest Income" },
    { value: "Rental Income", label: "Rental Income" },
    { value: "Grant", label: "Grant" },
    { value: "Sponsorship", label: "Sponsorship" },
    { value: "Sale Proceeds", label: "Sale Proceeds" },
    { value: "Refund Received", label: "Refund Received" },
    { value: "Other Income", label: "Other Income" },
  ];

  useEffect(() => {
    if (user) {
      getUserDoc(user.uid)
        .then((data) => {
          setUserData(data);
        })
        .finally(() => setLoading(false));
    }
  }, [user]);

  useEffect(() => {
    if (userData && params.id) {
      fetchIncomeDetail();
    }
  }, [userData, params.id]);

  const fetchIncomeDetail = async () => {
    try {
      setLoading(true);
      const currentYear = new Date().getFullYear().toString();
      const incomeRef = ref(db, `UAT/Accounts/${currentYear}/Income/${params.id}`);
      const snapshot = await get(incomeRef);

      if (snapshot.exists()) {
        const data = snapshot.val();
        const incomeItem: IncomeItem = {
          key: params.id as string,
          ...data,
        };
        setIncome(incomeItem);
        // Populate edit form
        setDate(incomeItem.date || "");
        setName(incomeItem.name || "");
        setMobileNumber(incomeItem.mobileNumber || "");
        setPanNumber(incomeItem.panNumber || "");
        setAmount(incomeItem.amount?.toString() || "");
        setCategory(incomeItem.category || "");
        setModeOfPayment((incomeItem.modeOfPayment as ModeOfPayment) || "");
        setChequeNumber(incomeItem.chequeNumber || "");
        setInputBy(incomeItem.inputBy || "");
      } else {
        setIncome(null);
      }
    } catch (error) {
      console.error("Error fetching income:", error);
      setIncome(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!income || !userData || !user) return;
    try {
      setSaving(true);
      const currentYear = new Date().getFullYear().toString();
      const incomeRef = ref(db, `UAT/Accounts/${currentYear}/Income/${params.id}`);

      // Get old data for audit
      const oldData = { ...income };

      // Remove the income record
      await remove(incomeRef);

      // Update total income
      const totalIncomeRef = ref(db, `UAT/Accounts/${currentYear}/total_income`);
      const totalSnapshot = await get(totalIncomeRef);
      if (totalSnapshot.exists()) {
        await set(totalIncomeRef, totalSnapshot.val() - income.amount);
      }

      // Log audit
      await logAudit({
        action: "DELETE",
        entityType: "Income",
        entityId: params.id as string,
        previousData: oldData,
        newData: null,
        changedBy: userData.name || user.email || "Unknown",
        changedByUid: user.uid,
        changedAt: new Date().toISOString(),
      });

      alert("Income record deleted successfully!");
      router.push("/income-list");
    } catch (error) {
      console.error("Error deleting income:", error);
      alert("Error deleting income. Please try again.");
    } finally {
      setSaving(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!income || !userData || !user) return;

    if (!name.trim() || !panNumber.trim() || !amount || parseFloat(amount) <= 0 || !category || !modeOfPayment) {
      alert("Please fill in all required fields.");
      return;
    }

    try {
      setSaving(true);
      const currentYear = new Date().getFullYear().toString();
      const incomeRef = ref(db, `UAT/Accounts/${currentYear}/Income/${params.id}`);
      const newAmount = parseFloat(amount);
      const amountDifference = newAmount - income.amount;

      // Get old data for audit
      const oldData = { ...income };

      const updatedData = {
        date,
        receiptNumber: income.receiptNumber,
        name: name.trim(),
        mobileNumber: mobileNumber || null,
        panNumber: panNumber.trim().toUpperCase(),
        amount: newAmount,
        category,
        modeOfPayment,
        chequeNumber: (modeOfPayment === "Cheque" || modeOfPayment === "NEFT") ? chequeNumber : null,
        inputBy: inputBy || userData.name,
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid,
      };

      // Update income record
      await update(incomeRef, updatedData);

      // Adjust total income if amount changed
      if (amountDifference !== 0) {
        const totalIncomeRef = ref(db, `UAT/Accounts/${currentYear}/total_income`);
        const totalSnapshot = await get(totalIncomeRef);
        if (totalSnapshot.exists()) {
          await set(totalIncomeRef, totalSnapshot.val() + amountDifference);
        }
      }

      // Log audit
      await logAudit({
        action: "UPDATE",
        entityType: "Income",
        entityId: params.id as string,
        previousData: oldData,
        newData: { ...oldData, ...updatedData },
        changedBy: userData.name || user.email || "Unknown",
        changedByUid: user.uid,
        changedAt: new Date().toISOString(),
      });

      alert("Income record updated successfully!");
      setIsEditing(false);
      fetchIncomeDetail();
    } catch (error) {
      console.error("Error updating income:", error);
      alert("Error updating income. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadPDF = () => {
    if (income) {
      const incomeData = {
        date: income.date,
        receiptNumber: income.receiptNumber,
        name: income.name,
        mobileNumber: income.mobileNumber || null,
        panNumber: income.panNumber || '',
        amount: income.amount,
        category: income.category,
        modeOfPayment: income.modeOfPayment || 'Cash',
        chequeNumber: income.chequeNumber || null,
        inputBy: income.inputBy || '',
        createdBy: income.createdBy,
        createdAt: income.createdAt,
      };
      generateReceiptPDF(incomeData as any);
    }
  };

  const canAccess = userData && 
    (userData.userType === "Accounts" || userData.userType === "GB");

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div>Loading...</div>
        </div>
      </ProtectedRoute>
    );
  }

  if (!canAccess) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 py-8 px-4">
          <div className="max-w-4xl mx-auto">
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
              <p className="font-medium">Access Denied</p>
              <p className="text-sm">You do not have permission to view this page.</p>
            </div>
            <button
              onClick={() => router.push("/dashboard")}
              className="mt-4 text-blue-600 hover:text-blue-800"
            >
              ← Back to Dashboard
            </button>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  if (!income) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 py-8 px-4">
          <div className="max-w-4xl mx-auto">
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-md">
              Income record not found.
            </div>
            <button
              onClick={() => router.push("/income-list")}
              className="mt-4 text-blue-600 hover:text-blue-800"
            >
              ← Back to Income List
            </button>
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
            <button
              onClick={() => router.push("/income-list")}
              className="mr-4 text-blue-600 hover:text-blue-800"
            >
              ← Back to Income List
            </button>
            <h1 className="text-3xl font-bold">
              {isEditing ? "Edit Income" : "Income Details"}
            </h1>
          </div>

          {isEditing ? (
            /* Edit Form */
            <div className="bg-white p-6 rounded-lg shadow">
              <form onSubmit={handleEdit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Receipt Number
                  </label>
                  <input
                    type="text"
                    value={income.receiptNumber}
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-600"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Number</label>
                  <input
                    type="tel"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    maxLength={10}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    PAN Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={panNumber}
                    onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    maxLength={10}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Amount <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    step="0.01"
                    min="0"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">-- Select Category --</option>
                    {categoryOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Mode of Payment <span className="text-red-500">*</span>
                  </label>
                  <div className="flex space-x-6">
                    {(["Cash", "Cheque", "NEFT"] as ModeOfPayment[]).map((mop) => (
                      <label key={mop} className="flex items-center">
                        <input
                          type="radio"
                          name="modeOfPayment"
                          value={mop}
                          checked={modeOfPayment === mop}
                          onChange={(e) => setModeOfPayment(e.target.value as ModeOfPayment)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="ml-2 text-gray-700">{mop}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {(modeOfPayment === "Cheque" || modeOfPayment === "NEFT") && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {modeOfPayment === "Cheque" ? "Cheque" : "Reference"} Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={chequeNumber}
                      onChange={(e) => setChequeNumber(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Input By</label>
                  <input
                    type="text"
                    value={inputBy}
                    onChange={(e) => setInputBy(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      // Reset form to original values
                      if (income) {
                        setDate(income.date || "");
                        setName(income.name || "");
                        setMobileNumber(income.mobileNumber || "");
                        setPanNumber(income.panNumber || "");
                        setAmount(income.amount?.toString() || "");
                        setCategory(income.category || "");
                        setModeOfPayment((income.modeOfPayment as ModeOfPayment) || "");
                        setChequeNumber(income.chequeNumber || "");
                        setInputBy(income.inputBy || "");
                      }
                    }}
                    className="flex-1 bg-gray-300 text-gray-700 py-3 px-4 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* Detail View */
            <>
              {/* Action Buttons */}
              <div className="flex gap-3 mb-6">
                <button
                  onClick={() => {
                    if (isStallBooking) {
                      alert("Stall Booking income records cannot be edited from income list. Please edit from the Stall List instead.");
                      return;
                    }
                    if (isDonationItem) {
                      alert("Donation Item income records cannot be edited from income list. Please edit from the Donation List instead.");
                      return;
                    }
                    setIsEditing(true);
                  }}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium ${
                    isStallBooking || isDonationItem
                      ? "bg-gray-400 text-gray-200 cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                  style={isStallBooking || isDonationItem ? { pointerEvents: 'auto' } : {}}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit
                </button>
                <button
                  onClick={() => {
                    if (isMembershipFee) {
                      alert("Membership Fee records cannot be deleted from income list. Please unmark the payment from the member's record instead.");
                      return;
                    }
                    if (isStallBooking) {
                      alert("Stall Booking income records cannot be deleted from income list. Please delete from the Stall List instead.");
                      return;
                    }
                    if (isDonationItem) {
                      alert("Donation Item income records cannot be deleted from income list. Please delete from the Donation List instead.");
                      return;
                    }
                    setShowDeleteConfirm(true);
                  }}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 font-medium ${
                    isDeleteDisabled
                      ? "bg-gray-400 text-gray-200 cursor-not-allowed"
                      : "bg-red-600 text-white hover:bg-red-700"
                  }`}
                  style={isDeleteDisabled ? { pointerEvents: 'auto' } : {}}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke={isDeleteDisabled ? "currentColor" : "currentColor"}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete
                </button>
                <button
                  onClick={handleDownloadPDF}
                  className="flex items-center gap-2 bg-purple-600 text-white px-5 py-2.5 rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Download PDF
                </button>
              </div>

              {/* Detail Card */}
              <div className="bg-white rounded-lg shadow overflow-hidden">
                {/* Header */}
                <div className="bg-blue-500 text-white p-6">
                  <h2 className="text-2xl font-bold">{income.receiptNumber}</h2>
                  <p className="text-blue-100 mt-1">
                    {new Date(income.date).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </p>
                </div>

                {/* Details */}
                <div className="p-6 space-y-6">
                  {/* Donor Information */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">Donor Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-500">Name</p>
                        <p className="text-base font-medium text-gray-900">{income.name}</p>
                      </div>
                      {income.mobileNumber && (
                        <div>
                          <p className="text-sm text-gray-500">Mobile Number</p>
                          <p className="text-base font-medium text-gray-900">{income.mobileNumber}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-sm text-gray-500">PAN Number</p>
                        <p className="text-base font-medium text-gray-900">{income.panNumber || '-'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Payment Details */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">Payment Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-500">Category</p>
                        <p className="text-base font-medium text-gray-900">{income.category}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Amount</p>
                        <p className="text-2xl font-bold text-green-600">
                          ₹ {income.amount.toLocaleString('en-IN', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Mode of Payment</p>
                        <p className="text-base font-medium text-gray-900">{income.modeOfPayment || 'Cash'}</p>
                      </div>
                      {income.chequeNumber && (
                        <div>
                          <p className="text-sm text-gray-500">
                            {income.modeOfPayment === 'Cheque' ? 'Cheque' : 'Reference'} Number
                          </p>
                          <p className="text-base font-medium text-gray-900">{income.chequeNumber}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Metadata */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">Record Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-500">Input By</p>
                        <p className="text-base font-medium text-gray-900">{income.inputBy || '-'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Created At</p>
                        <p className="text-base font-medium text-gray-900">
                          {income.createdAt
                            ? new Date(income.createdAt).toLocaleString('en-IN')
                            : '-'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Delete Confirmation Modal */}
          {showDeleteConfirm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Confirm Delete</h2>
                <p className="text-gray-600 mb-2">
                  Are you sure you want to delete this income record?
                </p>
                <p className="text-sm text-red-600 mb-6">
                  Receipt: <strong>{income.receiptNumber}</strong> — ₹ {income.amount.toLocaleString('en-IN')}
                  <br />
                  This action will also adjust the total income and cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleDelete}
                    disabled={saving}
                    className="flex-1 bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 font-medium disabled:opacity-50"
                  >
                    {saving ? "Deleting..." : "Yes, Delete"}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={saving}
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