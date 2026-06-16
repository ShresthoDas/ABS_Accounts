"use client";
import { useAuth } from "../../../context/AuthContext";
import ProtectedRoute from "../../../components/ProtectedRoute";
import { useEffect, useState } from "react";
import { getUserDoc } from "../../../utils/getUserDoc";
import { useRouter, useParams } from "next/navigation";
import { db } from "../../../firebase/config";
import { ref, get, set, update, remove, push } from "firebase/database";
import { generateReceiptPDF } from "../../../utils/generateReceiptPDF";
import { logAudit } from "../../../utils/auditLog";
import { dbPath, ROUTES, hasAccess, DONATION_EVENT_CATEGORIES, requiresReferenceNumber, DEFAULTS, getCurrentYearShort } from "../../../utils/constants";
import { useFinancialYear } from "../../../context/FinancialYearContext";

const roundMoney = (value: number) => Math.round(value * 100) / 100;

interface DonationItem {
  key: string;
  date?: string;
  donorName?: string;
  eventCategory?: string;
  amount?: number;
  paidAmount?: number;
  pendingAmount?: number;
  mobileNumber?: string;
  panNumber?: string;
  gotra?: string;
  familyDetails?: string;
  modeOfPayment?: string;
  chequeNumber?: string | null;
  incomeKey?: string;
  receiptNumber?: string;
  inputBy?: string;
  createdBy?: string;
  createdAt?: string;
  [key: string]: any;
}

type PaymentMode = "Cash" | "Cheque" | "NEFT";

export default function DonationDetailPage() {
  const { user } = useAuth();
  const { selectedYear } = useFinancialYear();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [donation, setDonation] = useState<DonationItem | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const router = useRouter();
  const params = useParams();

  // Edit form state
  const [editEventCategory, setEditEventCategory] = useState("");
  const [editDonorName, setEditDonorName] = useState("");
  const [editMobile, setEditMobile] = useState("");
  const [editPan, setEditPan] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editPaidAmount, setEditPaidAmount] = useState("");
  const [editPaidToday, setEditPaidToday] = useState("");
  const [editModeOfPayment, setEditModeOfPayment] = useState<PaymentMode | "">("");
  const [editChequeNumber, setEditChequeNumber] = useState("");
  const [editGotra, setEditGotra] = useState("");
  const [editFamilyDetails, setEditFamilyDetails] = useState("");

  useEffect(() => {
    if (user) {
      getUserDoc(user.uid)
        .then((data) => setUserData(data))
        .finally(() => setLoading(false));
    }
  }, [user]);

  const fetchDonation = async () => {
    try {
      setLoading(true);
      const currentYear = selectedYear;
      const snap = await get(ref(db, `${dbPath.donations(currentYear)}/${params.id}`));
      if (snap.exists()) {
        const d = snap.val();
        const donationItem: DonationItem = { key: params.id as string, ...d };
        setDonation(donationItem);
        setEditEventCategory(donationItem.eventCategory || "");
        setEditDonorName(donationItem.donorName || "");
        setEditMobile(donationItem.mobileNumber || "");
        setEditPan(donationItem.panNumber || "");
        setEditAmount(donationItem.amount?.toString() || "");
        setEditPaidAmount(donationItem.paidAmount?.toString() || "");
        setEditModeOfPayment((donationItem.modeOfPayment as PaymentMode) || "");
        setEditChequeNumber(donationItem.chequeNumber || "");
        setEditGotra(donationItem.gotra || "");
        setEditFamilyDetails(donationItem.familyDetails || "");
      } else {
        setDonation(null);
      }
    } catch (error) {
      console.error("Error fetching donation:", error);
      setDonation(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userData && params.id) {
      fetchDonation();
    }
  }, [userData, params.id, selectedYear]);

  const validateEditForm = () => {
    const ne: Record<string, string> = {};
    if (!editDonorName.trim()) ne.donorName = "Name is mandatory";
    if (!editAmount || parseFloat(editAmount) <= 0) ne.amount = "Amount must be greater than 0";
    const paidTodayAmount = roundMoney(parseFloat(editPaidToday) || 0);
    const newPaid = roundMoney((parseFloat(editPaidAmount) || 0) + paidTodayAmount);
    if (newPaid > parseFloat(editAmount)) ne.paidAmount = "Paid amount cannot exceed total amount";
    if (paidTodayAmount > 0 && !editModeOfPayment) ne.modeOfPayment = "Please select a mode of payment";
    if (paidTodayAmount > 0 && requiresReferenceNumber(editModeOfPayment) && !editChequeNumber.trim()) ne.chequeNumber = "Cheque/Reference number is mandatory for " + editModeOfPayment;
    setErrors(ne);
    return Object.keys(ne).length === 0;
  };

  const handleSave = async () => {
    if (!validateEditForm()) return;
    setSaving(true);
    try {
      const currentYear = selectedYear;
      const donationRef = ref(db, `${dbPath.donations(currentYear)}/${params.id}`);
      const oldPaidAmount = donation?.paidAmount || 0;
      const paidTodayAmount = roundMoney(parseFloat(editPaidToday) || 0);
      const newPaidAmount = roundMoney(oldPaidAmount + paidTodayAmount);

      if (paidTodayAmount > 0 && !editModeOfPayment) {
        alert("Please select a mode of payment for the new payment.");
        setSaving(false);
        return;
      }

      if (newPaidAmount > parseFloat(editAmount)) {
        alert("Paid amount cannot exceed the total amount.");
        setSaving(false);
        return;
      }

      const updatedData: Record<string, any> = {
        eventCategory: editEventCategory,
        donorName: editDonorName.trim(),
        mobileNumber: editMobile.trim(),
        panNumber: editPan.trim().toUpperCase(),
        gotra: editGotra.trim(),
        familyDetails: editFamilyDetails.trim(),
        amount: roundMoney(parseFloat(editAmount)),
        paidAmount: newPaidAmount,
        pendingAmount: roundMoney(parseFloat(editAmount) - newPaidAmount),
        updatedAt: new Date().toISOString(),
        updatedBy: user?.uid,
      };

      // Handle income record - create a NEW separate income record for this payment (preserves audit trail)
      if (paidTodayAmount > 0) {
        const receiptYear = getCurrentYearShort();
        const receiptCounterRef = ref(db, dbPath.receiptCounter(receiptYear));
        const counterSnapshot = await get(receiptCounterRef);
        let nextReceiptNum = 1;
        if (counterSnapshot.exists()) {
          nextReceiptNum = counterSnapshot.val() + 1;
        }
        const newReceiptNumber = `ABS/${receiptYear}/${nextReceiptNum}`;

        const newIncomeRef = push(ref(db, dbPath.income(currentYear)));
        const incomeKey = newIncomeRef.key;
        const todayStr = new Date().toISOString().split("T")[0];

        const incomeData = {
          key: incomeKey,
          date: todayStr,
          receiptNumber: newReceiptNumber,
          name: editDonorName.trim(),
          mobileNumber: editMobile.trim(),
          panNumber: editPan.trim().toUpperCase(),
          amount: paidTodayAmount,
          category: DEFAULTS.DONATION_INCOME_CATEGORY,
          modeOfPayment: editModeOfPayment,
          chequeNumber: requiresReferenceNumber(editModeOfPayment) ? editChequeNumber : null,
          inputBy: donation?.inputBy || userData?.name || "Unknown",
          createdAt: new Date().toISOString(),
          createdBy: user?.uid,
          donationLink: params.id as string,
        };

        await set(newIncomeRef, incomeData);
        await set(receiptCounterRef, nextReceiptNum);

        // Generate receipt PDF for the new income
        generateReceiptPDF(incomeData);

        // Link this new income key to the donation record
        updatedData.incomeKey = incomeKey;
        updatedData.receiptNumber = newReceiptNumber;
        updatedData.modeOfPayment = editModeOfPayment;
        updatedData.chequeNumber = requiresReferenceNumber(editModeOfPayment) ? editChequeNumber : null;

        // Update total income by the paidToday amount
        const totalIncomeRef = ref(db, dbPath.totalIncome(currentYear));
        const totalSnapshot = await get(totalIncomeRef);
        const currentTotal = totalSnapshot.exists() ? totalSnapshot.val() : 0;
        await set(totalIncomeRef, Math.max(0, currentTotal + paidTodayAmount));
      }

      await update(donationRef, updatedData);

      await logAudit({
        action: "UPDATE",
        entityType: "Donation",
        entityId: params.id as string,
        previousData: donation,
        newData: { ...donation, ...updatedData },
        changedBy: userData?.name || user?.email || "Unknown",
        changedByUid: user?.uid || "",
        changedAt: new Date().toISOString(),
      });

      alert("Donation updated successfully!");
      setIsEditing(false);
      setEditPaidToday("");
      fetchDonation();
    } catch (error) {
      console.error("Error updating donation:", error);
      alert("Error updating donation. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!donation || !userData || !user) return;
    try {
      setSaving(true);
      const currentYear = selectedYear;
      const donationRef = ref(db, `${dbPath.donations(currentYear)}/${params.id}`);
      const oldData = { ...donation };

      // If there's a linked income record, remove it and adjust total income
      if (donation.incomeKey && donation.paidAmount && donation.paidAmount > 0) {
        const incomeRef = ref(db, `${dbPath.income(currentYear)}/${donation.incomeKey}`);
        const incomeSnapshot = await get(incomeRef);
        if (incomeSnapshot.exists()) {
          await remove(incomeRef);
        }

        const totalIncomeRef = ref(db, dbPath.totalIncome(currentYear));
        const totalSnapshot = await get(totalIncomeRef);
        if (totalSnapshot.exists()) {
          await set(totalIncomeRef, Math.max(0, totalSnapshot.val() - donation.paidAmount));
        }
      }

      await remove(donationRef);

      await logAudit({
        action: "DELETE",
        entityType: "Donation",
        entityId: params.id as string,
        previousData: oldData,
        newData: null,
        changedBy: userData.name || user.email || "Unknown",
        changedByUid: user.uid,
        changedAt: new Date().toISOString(),
      });

      alert("Donation deleted successfully!");
      router.push(ROUTES.DONATION_LIST);
    } catch (error) {
      console.error("Error deleting donation:", error);
      alert("Error deleting donation. Please try again.");
    } finally {
      setSaving(false);
      setShowDeleteConfirm(false);
    }
  };

  const canAccess = userData && hasAccess(userData.userType);

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

  if (!donation) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 py-8 px-4">
          <div className="max-w-4xl mx-auto">
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-md">Donation record not found.</div>
            <button onClick={() => router.push(ROUTES.DONATION_LIST)} className="mt-4 text-blue-600 hover:text-blue-800">← Back to Donation List</button>
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
            <button onClick={() => router.push(ROUTES.DONATION_LIST)} className="mr-4 text-blue-600 hover:text-blue-800">← Back to Donation List</button>
            <h1 className="text-3xl font-bold">{isEditing ? "Edit Donation" : "Donation Details"}</h1>
          </div>

          {isEditing ? (
            /* Edit Form */
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Event Category <span className="text-red-500">*</span></label>
                  <select value={editEventCategory} onChange={e => setEditEventCategory(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {DONATION_EVENT_CATEGORIES.map(c => (<option key={c.value} value={c.value}>{c.label}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Donor Name <span className="text-red-500">*</span></label>
                  <input type="text" value={editDonorName} onChange={e => setEditDonorName(e.target.value)} className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.donorName ? "border-red-500" : "border-gray-300"}`} />
                  {errors.donorName && <p className="mt-1 text-sm text-red-500">{errors.donorName}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mobile</label>
                  <input type="text" value={editMobile} onChange={e => setEditMobile(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" maxLength={10} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">PAN</label>
                  <input type="text" value={editPan} onChange={e => setEditPan(e.target.value.toUpperCase())} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" maxLength={10} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gotra</label>
                  <input type="text" value={editGotra} onChange={e => setEditGotra(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Family Details</label>
                  <textarea value={editFamilyDetails} onChange={e => setEditFamilyDetails(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" rows={2} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Total Amount (₹) <span className="text-red-500">*</span></label>
                  <input type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)} className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.amount ? "border-red-500" : "border-gray-300"}`} step="0.01" min="0" />
                  {errors.amount && <p className="mt-1 text-sm text-red-500">{errors.amount}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Paid Amount (₹)</label>
                  <input type="number" value={editPaidAmount} disabled className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-500 cursor-not-allowed" step="0.01" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Paid Today (₹)</label>
                  <input type="number" value={editPaidToday} onChange={e => { setEditPaidToday(e.target.value); setErrors({ ...errors, paidAmount: "" }); }} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" step="0.01" min="0" placeholder="0.00" />
                </div>

                {(() => {
                  const oldPaid = parseFloat(editPaidAmount) || 0;
                  const p = oldPaid + (parseFloat(editPaidToday) || 0);
                  const t = parseFloat(editAmount) || 0;
                  const pend = t - p;
                  if (t > 0) {
                    return (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Pending Amount</label>
                        <div className={`w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 ${pend > 0 ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}`}>
                          ₹ {Math.max(0, pend).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                    );
                  }
                })()}

                {((parseFloat(editPaidAmount) || 0) > 0 || (parseFloat(editPaidToday) || 0) > 0) && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Mode of Payment <span className="text-red-500">*</span></label>
                      <div className="flex space-x-6">
                        {(["Cash", "Cheque", "NEFT"] as PaymentMode[]).map((mop) => (
                          <label key={mop} className="flex items-center">
                            <input type="radio" name="editModeOfPayment" value={mop} checked={editModeOfPayment === mop} onChange={(e) => setEditModeOfPayment(e.target.value as PaymentMode)} className="h-4 w-4 text-blue-600 focus:ring-blue-500" />
                            <span className="ml-2 text-gray-700">{mop}</span>
                          </label>
                        ))}
                      </div>
                      {errors.modeOfPayment && <p className="mt-1 text-sm text-red-500">{errors.modeOfPayment}</p>}
                    </div>

                    {requiresReferenceNumber(editModeOfPayment) && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{editModeOfPayment === "Cheque" ? "Cheque" : "Reference"} Number <span className="text-red-500">*</span></label>
                        <input type="text" value={editChequeNumber} onChange={(e) => setEditChequeNumber(e.target.value)} className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.chequeNumber ? "border-red-500" : "border-gray-300"}`} />
                        {errors.chequeNumber && <p className="mt-1 text-sm text-red-500">{errors.chequeNumber}</p>}
                      </div>
                    )}
                  </>
                )}

                <div className="flex gap-3">
                  <button onClick={handleSave} disabled={saving} className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium disabled:opacity-50">
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                  <button type="button" onClick={() => { setIsEditing(false); setEditPaidToday(""); fetchDonation(); }} className="flex-1 bg-gray-300 text-gray-700 py-3 px-4 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 font-medium">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Detail View */
            <>
              <div className="flex gap-3 mb-6">
                <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  Edit
                </button>
                <button onClick={() => setShowDeleteConfirm(true)} className="flex items-center gap-2 bg-red-600 text-white px-5 py-2.5 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 font-medium">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  Delete
                </button>
              </div>

              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="bg-rose-500 text-white p-6">
                  <h2 className="text-2xl font-bold">{donation.donorName}</h2>
                  <p className="text-rose-100 mt-1">
                    {donation.date ? new Date(donation.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : '-'}
                  </p>
                </div>

                <div className="p-6 space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">Donation Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-500">Donor Name</p>
                        <p className="text-base font-medium text-gray-900">{donation.donorName || '-'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Event Category</p>
                        <p className="text-base font-medium text-gray-900">
                          <span className="inline-flex px-2 py-0.5 rounded text-sm font-medium bg-rose-100 text-rose-800">{donation.eventCategory || '-'}</span>
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Mobile Number</p>
                        <p className="text-base font-medium text-gray-900">{donation.mobileNumber || '-'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">PAN Number</p>
                        <p className="text-base font-medium text-gray-900">{donation.panNumber || '-'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Gotra</p>
                        <p className="text-base font-medium text-gray-900">{donation.gotra || '-'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Family Details</p>
                        <p className="text-base font-medium text-gray-900">{donation.familyDetails || '-'}</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">Payment Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-gray-50 p-3 rounded">
                        <p className="text-sm text-gray-500">Total Amount</p>
                        <p className="text-xl font-bold text-gray-900">
                          ₹ {(donation.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div className="bg-green-50 p-3 rounded">
                        <p className="text-sm text-gray-500">Paid Amount</p>
                        <p className="text-xl font-bold text-green-600">
                          ₹ {(donation.paidAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div className={`p-3 rounded ${(donation.pendingAmount || 0) > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                        <p className="text-sm text-gray-500">Pending Amount</p>
                        <p className={`text-xl font-bold ${(donation.pendingAmount || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          ₹ {(donation.pendingAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      {donation.modeOfPayment && (
                        <div>
                          <p className="text-sm text-gray-500">Mode of Payment</p>
                          <p className="text-base font-medium text-gray-900">{donation.modeOfPayment}</p>
                        </div>
                      )}
                      {donation.chequeNumber && (
                        <div>
                          <p className="text-sm text-gray-500">{donation.modeOfPayment === 'Cheque' ? 'Cheque' : 'Reference'} Number</p>
                          <p className="text-base font-medium text-gray-900">{donation.chequeNumber}</p>
                        </div>
                      )}
                      {donation.receiptNumber && (
                        <div>
                          <p className="text-sm text-gray-500">Receipt Number</p>
                          <p className="text-base font-medium text-gray-900">{donation.receiptNumber}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">Record Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-500">Input By</p>
                        <p className="text-base font-medium text-gray-900">{donation.inputBy || '-'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Created At</p>
                        <p className="text-base font-medium text-gray-900">{donation.createdAt ? new Date(donation.createdAt).toLocaleString('en-IN') : '-'}</p>
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
                <p className="text-gray-600 mb-2">Are you sure you want to delete this donation?</p>
                <p className="text-sm text-red-600 mb-6">
                  Donor: <strong>{donation.donorName}</strong> — Total: ₹ {(donation.amount || 0).toLocaleString('en-IN')}
                  <br />
                  {donation.incomeKey && "Linked income record and total income will also be adjusted. "}
                  This action cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button onClick={handleDelete} disabled={saving} className="flex-1 bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 font-medium disabled:opacity-50">
                    {saving ? "Deleting..." : "Yes, Delete"}
                  </button>
                  <button onClick={() => setShowDeleteConfirm(false)} disabled={saving} className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 font-medium">
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