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
import { dbPath, ROUTES, hasAccess, STALL_TYPES, requiresReferenceNumber, DEFAULTS, getCurrentYearShort } from "../../../utils/constants";
import { useFinancialYear } from "../../../context/FinancialYearContext";

// Helper to round monetary values to 2 decimal places (avoids floating point issues like 30000 - 0 = 29999.9995)
const roundMoney = (value: number): number => Math.round(value * 100) / 100;

interface StallItem {
  key: string;
  date?: string;
  stallNumber?: number;
  stallName?: string;
  name?: string;
  panNumber?: string;
  mobileNumber?: string;
  stallType?: string;
  quantity?: number;
  totalAmount?: number;
  paidAmount?: number;
  pendingAmount?: number;
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

export default function StallDetailPage() {
  const { user } = useAuth();
  const { selectedYear } = useFinancialYear();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stall, setStall] = useState<StallItem | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const router = useRouter();
  const params = useParams();

  // Edit form state
  const [date, setDate] = useState("");
  const [stallNumber, setStallNumber] = useState("0");
  const [name, setName] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [stallType, setStallType] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [totalAmount, setTotalAmount] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [paidToday, setPaidToday] = useState("");
  const [modeOfPayment, setModeOfPayment] = useState<PaymentMode | "">("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [stallName, setStallName] = useState("");
  const [referredBy, setReferredBy] = useState("");
  const [inputBy, setInputBy] = useState("");

  useEffect(() => {
    if (user) {
      getUserDoc(user.uid)
        .then((data) => setUserData(data))
        .finally(() => setLoading(false));
    }
  }, [user]);

  useEffect(() => {
    if (userData && params.id) {
      fetchStallDetail();
    }
  }, [userData, params.id]);

  const fetchStallDetail = async () => {
    try {
      setLoading(true);
      const currentYear = selectedYear;
      const stallRef = ref(db, `${dbPath.stalls(currentYear)}/${params.id}`);
      const snapshot = await get(stallRef);

      if (snapshot.exists()) {
        const data = snapshot.val();
        const stallItem: StallItem = { key: params.id as string, ...data };
        setStall(stallItem);
        // Populate edit form
        setDate(stallItem.date || "");
        setStallNumber(stallItem.stallNumber?.toString() || "0");
        setName(stallItem.name || "");
        setPanNumber(stallItem.panNumber || "");
        setMobileNumber(stallItem.mobileNumber || "");
        setStallType(stallItem.stallType || "");
        setQuantity(stallItem.quantity?.toString() || "1");
        setTotalAmount(stallItem.totalAmount?.toString() || "");
        setPaidAmount(stallItem.paidAmount?.toString() || "");
        setModeOfPayment((stallItem.modeOfPayment as PaymentMode) || "");
        setChequeNumber(stallItem.chequeNumber || "");
        setStallName(stallItem.stallName || "");
        setReferredBy(stallItem.referredBy || "");
        setInputBy(stallItem.inputBy || "");
      } else {
        setStall(null);
      }
    } catch (error) {
      console.error("Error fetching stall:", error);
      setStall(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!stall || !userData || !user) return;
    try {
      setSaving(true);
      const currentYear = selectedYear;
      const stallRef = ref(db, `${dbPath.stalls(currentYear)}/${params.id}`);
      const oldData = { ...stall };

      // If there's a linked income record, remove it and adjust total income
      if (stall.incomeKey && stall.paidAmount && stall.paidAmount > 0) {
        const incomeRef = ref(db, `${dbPath.income(currentYear)}/${stall.incomeKey}`);
        const incomeSnapshot = await get(incomeRef);
        if (incomeSnapshot.exists()) {
          await remove(incomeRef);
        }

        const totalIncomeRef = ref(db, dbPath.totalIncome(currentYear));
        const totalSnapshot = await get(totalIncomeRef);
        if (totalSnapshot.exists()) {
          await set(totalIncomeRef, Math.max(0, totalSnapshot.val() - stall.paidAmount));
        }
      }

      // Remove the stall record
      await remove(stallRef);

      await logAudit({
        action: "DELETE",
        entityType: "Stall",
        entityId: params.id as string,
        previousData: oldData,
        newData: null,
        changedBy: userData.name || user.email || "Unknown",
        changedByUid: user.uid,
        changedAt: new Date().toISOString(),
      });

      alert("Stall booking deleted successfully!");
      router.push(ROUTES.STALL_LIST);
    } catch (error) {
      console.error("Error deleting stall:", error);
      alert("Error deleting stall. Please try again.");
    } finally {
      setSaving(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stall || !userData || !user) return;

    const paidTodayAmount = roundMoney(parseFloat(paidToday) || 0);
    const newPaid = roundMoney((parseFloat(paidAmount) || 0) + paidTodayAmount);
    const newTotal = roundMoney(parseFloat(totalAmount) || 0);
    const newPending = roundMoney(newTotal - newPaid);

    if (!name.trim() || !panNumber.trim() || !mobileNumber.trim() || !stallType || newTotal <= 0) {
      alert("Please fill in all required fields.");
      return;
    }

    if (newPaid > newTotal) {
      alert("Paid amount cannot exceed total amount.");
      return;
    }

    if (paidTodayAmount > 0 && !modeOfPayment) {
      alert("Please select a mode of payment for the new payment.");
      return;
    }

    try {
      setSaving(true);
      const currentYear = selectedYear;
      const stallRef = ref(db, `${dbPath.stalls(currentYear)}/${params.id}`);
      const oldData = { ...stall };
      const oldPaidAmount = stall.paidAmount || 0;
      const paidDifference = newPaid - oldPaidAmount;

      const updatedData: Record<string, any> = {
        date,
        stallNumber: parseInt(stallNumber) || 0,
        stallName: stallName.trim() || null,
        name: name.trim(),
        panNumber: panNumber.trim().toUpperCase(),
        mobileNumber: mobileNumber.trim(),
        stallType,
        quantity: parseInt(quantity) || 1,
        totalAmount: newTotal,
        paidAmount: newPaid,
        pendingAmount: newPending,
        inputBy: inputBy || userData.name,
        referredBy: referredBy.trim() || null,
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid,
      };

      // Handle income record changes based on paid today amount
      if (paidTodayAmount > 0) {
        // Create a NEW separate income record for this payment (preserves audit trail)
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
          name: name.trim(),
          mobileNumber: mobileNumber.trim(),
          panNumber: panNumber.trim().toUpperCase(),
          amount: paidTodayAmount,
          category: DEFAULTS.STALL_INCOME_CATEGORY,
          modeOfPayment,
          chequeNumber: requiresReferenceNumber(modeOfPayment) ? chequeNumber : null,
          stallName: stallName.trim() || null,
          inputBy: inputBy || userData.name,
          createdAt: new Date().toISOString(),
          createdBy: user.uid,
          stallLink: params.id,
        };

        await set(newIncomeRef, incomeData);
        await set(receiptCounterRef, nextReceiptNum);

        // Generate receipt PDF for the new income
        generateReceiptPDF(incomeData);

        // Link this new income key to the stall record (overwrites previous link,
        // but the previous income record still exists independently)
        updatedData.incomeKey = incomeKey;
        updatedData.receiptNumber = newReceiptNumber;
        updatedData.modeOfPayment = modeOfPayment;
        updatedData.chequeNumber = requiresReferenceNumber(modeOfPayment) ? chequeNumber : null;

        // Update total income by the paidToday amount
        const totalIncomeRef = ref(db, dbPath.totalIncome(currentYear));
        const totalSnapshot = await get(totalIncomeRef);
        const currentTotal = totalSnapshot.exists() ? totalSnapshot.val() : 0;
        await set(totalIncomeRef, Math.max(0, currentTotal + paidTodayAmount));
      }

      await update(stallRef, updatedData);

      await logAudit({
        action: "UPDATE",
        entityType: "Stall",
        entityId: params.id as string,
        previousData: oldData,
        newData: { ...oldData, ...updatedData },
        changedBy: userData.name || user.email || "Unknown",
        changedByUid: user.uid,
        changedAt: new Date().toISOString(),
      });

      alert("Stall booking updated successfully!");
      setIsEditing(false);
      fetchStallDetail();
    } catch (error) {
      console.error("Error updating stall:", error);
      alert("Error updating stall. Please try again.");
    } finally {
      setSaving(false);
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

  if (!stall) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 py-8 px-4">
          <div className="max-w-4xl mx-auto">
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-md">Stall booking record not found.</div>
            <button onClick={() => router.push(ROUTES.STALL_LIST)} className="mt-4 text-blue-600 hover:text-blue-800">← Back to Stall List</button>
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
            <button onClick={() => router.push(ROUTES.STALL_LIST)} className="mr-4 text-blue-600 hover:text-blue-800">← Back to Stall List</button>
            <h1 className="text-3xl font-bold">{isEditing ? "Edit Stall Booking" : "Stall Booking Details"}</h1>
          </div>

          {isEditing ? (
            /* Edit Form */
            <div className="bg-white p-6 rounded-lg shadow">
              <form onSubmit={handleEdit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Stall Number</label>
                  <input type="number" value={stallNumber} onChange={(e) => setStallNumber(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" min="0" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">PAN Number <span className="text-red-500">*</span></label>
                  <input type="text" value={panNumber} onChange={(e) => setPanNumber(e.target.value.toUpperCase())} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" maxLength={10} required />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Number <span className="text-red-500">*</span></label>
                  <input type="tel" value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" maxLength={10} required />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Stall Type <span className="text-red-500">*</span></label>
                  <select value={stallType} onChange={(e) => setStallType(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                    <option value="">-- Select Stall Type --</option>
                    {STALL_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                  <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" min="1" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Total Amount (₹) <span className="text-red-500">*</span></label>
                  <input type="number" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" step="0.01" min="0" required />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Paid Amount (₹)</label>
                  <input type="number" value={paidAmount} disabled className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-500 cursor-not-allowed" step="0.01" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Paid Today (₹)</label>
                  <input type="number" value={paidToday} onChange={(e) => setPaidToday(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" step="0.01" min="0" placeholder="0.00" />
                </div>

                {(() => {
                  const oldPaid = parseFloat(paidAmount) || 0;
                  const p = oldPaid + (parseFloat(paidToday) || 0);
                  const t = parseFloat(totalAmount) || 0;
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

                {((parseFloat(paidAmount) || 0) > 0 || (parseFloat(paidToday) || 0) > 0) && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Mode of Payment <span className="text-red-500">*</span></label>
                      <div className="flex space-x-6">
                        {(["Cash", "Cheque", "NEFT"] as PaymentMode[]).map((mop) => (
                          <label key={mop} className="flex items-center">
                            <input type="radio" name="editModeOfPayment" value={mop} checked={modeOfPayment === mop} onChange={(e) => setModeOfPayment(e.target.value as PaymentMode)} className="h-4 w-4 text-blue-600 focus:ring-blue-500" />
                            <span className="ml-2 text-gray-700">{mop}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {requiresReferenceNumber(modeOfPayment) && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{modeOfPayment === "Cheque" ? "Cheque" : "Reference"} Number <span className="text-red-500">*</span></label>
                        <input type="text" value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                      </div>
                    )}
                  </>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Stall Name</label>
                  <input type="text" value={stallName} onChange={(e) => setStallName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Enter stall name (optional)" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Referred By</label>
                  <input type="text" value={referredBy} onChange={(e) => setReferredBy(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Enter referrer name (optional)" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Input By</label>
                  <input type="text" value={inputBy} onChange={(e) => setInputBy(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="flex gap-3">
                  <button type="submit" disabled={saving} className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium disabled:opacity-50">
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                  <button type="button" onClick={() => { setIsEditing(false); if (stall) { setDate(stall.date || ""); setStallNumber(stall.stallNumber?.toString() || "0"); setStallName(stall.stallName || ""); setName(stall.name || ""); setPanNumber(stall.panNumber || ""); setMobileNumber(stall.mobileNumber || ""); setStallType(stall.stallType || ""); setQuantity(stall.quantity?.toString() || "1"); setTotalAmount(stall.totalAmount?.toString() || ""); setPaidAmount(stall.paidAmount?.toString() || ""); setPaidToday(""); setModeOfPayment((stall.modeOfPayment as PaymentMode) || ""); setChequeNumber(stall.chequeNumber || ""); setInputBy(stall.inputBy || ""); } }} className="flex-1 bg-gray-300 text-gray-700 py-3 px-4 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 font-medium">
                    Cancel
                  </button>
                </div>
              </form>
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
                <div className="bg-teal-500 text-white p-6">
                  <h2 className="text-2xl font-bold">{stall.name}</h2>
                  <p className="text-teal-100 mt-1">
                    {stall.date ? new Date(stall.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : '-'}
                    {stall.stallNumber !== undefined && stall.stallNumber !== null && <span className="ml-4">Stall #{stall.stallNumber}</span>}
                  </p>
                </div>

                <div className="p-6 space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">Booking Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-500">Name</p>
                        <p className="text-base font-medium text-gray-900">{stall.name}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Stall Number</p>
                        <p className="text-base font-medium text-gray-900">{stall.stallNumber ?? '-'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Stall Name</p>
                        <p className="text-base font-medium text-gray-900">{stall.stallName || '-'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Stall Type</p>
                        <p className="text-base font-medium text-gray-900">
                          <span className={`inline-flex px-2 py-0.5 rounded text-sm font-medium ${stall.stallType === 'Food' ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'}`}>
                            {stall.stallType || '-'}
                          </span>
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Quantity</p>
                        <p className="text-base font-medium text-gray-900">{stall.quantity ?? 1}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Mobile Number</p>
                        <p className="text-base font-medium text-gray-900">{stall.mobileNumber || '-'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">PAN Number</p>
                        <p className="text-base font-medium text-gray-900">{stall.panNumber || '-'}</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">Payment Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-gray-50 p-3 rounded">
                        <p className="text-sm text-gray-500">Total Amount</p>
                        <p className="text-xl font-bold text-gray-900">
                          ₹ {(stall.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div className="bg-green-50 p-3 rounded">
                        <p className="text-sm text-gray-500">Paid Amount</p>
                        <p className="text-xl font-bold text-green-600">
                          ₹ {(stall.paidAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div className={`p-3 rounded ${(stall.pendingAmount || 0) > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                        <p className="text-sm text-gray-500">Pending Amount</p>
                        <p className={`text-xl font-bold ${(stall.pendingAmount || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          ₹ {(stall.pendingAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      {stall.modeOfPayment && (
                        <div>
                          <p className="text-sm text-gray-500">Mode of Payment</p>
                          <p className="text-base font-medium text-gray-900">{stall.modeOfPayment}</p>
                        </div>
                      )}
                      {stall.chequeNumber && (
                        <div>
                          <p className="text-sm text-gray-500">{stall.modeOfPayment === 'Cheque' ? 'Cheque' : 'Reference'} Number</p>
                          <p className="text-base font-medium text-gray-900">{stall.chequeNumber}</p>
                        </div>
                      )}
                      {stall.receiptNumber && (
                        <div>
                          <p className="text-sm text-gray-500">Receipt Number</p>
                          <p className="text-base font-medium text-gray-900">{stall.receiptNumber}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">Record Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-500">Input By</p>
                        <p className="text-base font-medium text-gray-900">{stall.inputBy || '-'}</p>
                      </div>
                      {stall.referredBy && (
                        <div>
                          <p className="text-sm text-gray-500">Referred By</p>
                          <p className="text-base font-medium text-gray-900">{stall.referredBy}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-sm text-gray-500">Created At</p>
                        <p className="text-base font-medium text-gray-900">{stall.createdAt ? new Date(stall.createdAt).toLocaleString('en-IN') : '-'}</p>
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
                <p className="text-gray-600 mb-2">Are you sure you want to delete this stall booking?</p>
                <p className="text-sm text-red-600 mb-6">
                  Name: <strong>{stall.name}</strong> — Total: ₹ {(stall.totalAmount || 0).toLocaleString('en-IN')}
                  <br />
                  {stall.incomeKey && "Linked income record and total income will also be adjusted. "}
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