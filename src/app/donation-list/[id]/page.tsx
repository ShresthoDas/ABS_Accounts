"use client";
import { useAuth } from "../../../context/AuthContext";
import ProtectedRoute from "../../../components/ProtectedRoute";
import { useEffect, useState } from "react";
import { getUserDoc } from "../../../utils/getUserDoc";
import { useRouter, useParams } from "next/navigation";
import { db } from "../../../firebase/config";
import { ref, get, update, remove, set, push } from "firebase/database";
import { generateReceiptPDF } from "../../../utils/generateReceiptPDF";
import { logAudit } from "../../../utils/auditLog";
import { useFinancialYear } from "../../../context/FinancialYearContext";
import { dbPath, ROUTES, DONATION_EVENT_CATEGORIES, requiresReferenceNumber, DEFAULTS, getCurrentYearShort } from "../../../utils/constants";

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export default function DonationDetailPage() {
  const { user } = useAuth();
  const { selectedYear } = useFinancialYear();
  const [userData, setUserData] = useState<any>(null);
  const router = useRouter();
  const params = useParams();
  const [donation, setDonation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [editEventCategory, setEditEventCategory] = useState("");
  const [editDonorName, setEditDonorName] = useState("");
  const [editMobile, setEditMobile] = useState("");
  const [editPan, setEditPan] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editPaidAmount, setEditPaidAmount] = useState("");
  const [editPaidToday, setEditPaidToday] = useState("");
  const [editModeOfPayment, setEditModeOfPayment] = useState<"Cash" | "Cheque" | "NEFT" | "">("");
  const [editChequeNumber, setEditChequeNumber] = useState("");

  useEffect(() => { if (user) { getUserDoc(user.uid).then(setUserData).finally(() => setLoading(false)); } }, [user]);

  const fetchDonation = async () => {
    setLoading(true);
    try {
      const currentYear = selectedYear;
      const snap = await get(ref(db, `${dbPath.donations(currentYear)}/${params.id}`));
      if (snap.exists()) {
        const d = snap.val();
        setDonation(d);
        setEditEventCategory(d.eventCategory || "");
        setEditDonorName(d.donorName || "");
        setEditMobile(d.mobileNumber || "");
        setEditPan(d.panNumber || "");
        setEditAmount(d.amount?.toString() || "");
        setEditPaidAmount(d.paidAmount?.toString() || "");
        setEditModeOfPayment(d.modeOfPayment || "");
        setEditChequeNumber(d.chequeNumber || "");
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { if (userData) fetchDonation(); }, [userData, selectedYear]);

  const validateEdit = () => {
    const ne: Record<string, string> = {};
    if (!editDonorName.trim()) ne.donorName = "Name is mandatory";
    if (!editAmount || parseFloat(editAmount) <= 0) ne.amount = "Amount must be > 0";
    setErrors(ne); return Object.keys(ne).length === 0;
  };

  const handleSave = async () => {
    if (!validateEdit()) return;
    setSaving(true);
    try {
      const currentYear = selectedYear;
      const ref_ = ref(db, `${dbPath.donations(currentYear)}/${params.id}`);
      const oldPaidAmount = donation.paidAmount || 0;
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
          name: editDonorName,
          mobileNumber: editMobile,
          panNumber: editPan,
          amount: paidTodayAmount,
          category: DEFAULTS.DONATION_INCOME_CATEGORY,
          modeOfPayment: editModeOfPayment,
          chequeNumber: requiresReferenceNumber(editModeOfPayment) ? editChequeNumber : null,
          inputBy: donation.inputBy || userData?.name || "Unknown",
          createdAt: new Date().toISOString(),
          createdBy: user?.uid,
          donationLink: params.id,
        };

        await set(newIncomeRef, incomeData);
        await set(receiptCounterRef, nextReceiptNum);

        // Generate receipt PDF for the new income
        generateReceiptPDF(incomeData);

        // Link this new income key to the donation record
        await update(ref_, {
          incomeKey: incomeKey,
          receiptNumber: newReceiptNumber,
          modeOfPayment: editModeOfPayment,
          chequeNumber: requiresReferenceNumber(editModeOfPayment) ? editChequeNumber : null,
        });

        // Update total income by the paidToday amount
        const totalIncomeRef = ref(db, dbPath.totalIncome(currentYear));
        const totalSnapshot = await get(totalIncomeRef);
        const currentTotal = totalSnapshot.exists() ? totalSnapshot.val() : 0;
        await set(totalIncomeRef, Math.max(0, currentTotal + paidTodayAmount));
      }

      // Update the donation record with new paid/pending amounts
      await update(ref_, {
        eventCategory: editEventCategory,
        donorName: editDonorName,
        mobileNumber: editMobile,
        panNumber: editPan,
        amount: parseFloat(editAmount),
        paidAmount: newPaidAmount,
        pendingAmount: roundMoney(parseFloat(editAmount) - newPaidAmount),
      });

      setIsEditing(false);
      fetchDonation();
      alert("Donation updated!");
    } catch (e) { console.error(e); alert("Error updating."); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      const currentYear = selectedYear;
      await remove(ref(db, `${dbPath.donations(currentYear)}/${params.id}`));
      if (donation.incomeKey) {
        await remove(ref(db, `${dbPath.income(currentYear)}/${donation.incomeKey}`));
        const tiRef = ref(db, dbPath.totalIncome(currentYear));
        const tiSnap = await get(tiRef);
        if (tiSnap.exists()) await set(tiRef, tiSnap.val() - (donation.paidAmount || 0));
      }
      setShowDeleteModal(false);
      alert("Donation deleted!");
      router.push(ROUTES.DONATION_LIST);
    } catch (e) { console.error(e); alert("Error deleting."); } finally { setSaving(false); }
  };

  if (loading) return (<ProtectedRoute><div className="min-h-screen flex items-center justify-center"><div>Loading...</div></div></ProtectedRoute>);
  if (!donation) return (<ProtectedRoute><div className="min-h-screen flex items-center justify-center"><div className="text-center"><h2 className="text-2xl font-bold mb-4">Donation Not Found</h2><button onClick={() => router.push(ROUTES.DONATION_LIST)} className="text-blue-600 hover:underline">← Back</button></div></div></ProtectedRoute>);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center mb-6">
            <button onClick={() => router.push(ROUTES.DONATION_LIST)} className="mr-4 text-blue-600 hover:text-blue-800">← Back</button>
            <h1 className="text-3xl font-bold">Donation Details</h1>
          </div>
          {isEditing ? (
            <div className="bg-white p-6 rounded-lg shadow space-y-4">
              <h2 className="text-lg font-semibold">Edit Donation</h2>
              <div><label className="block text-sm font-medium">Event Category</label><select value={editEventCategory} onChange={e => setEditEventCategory(e.target.value)} className="w-full px-3 py-2 border rounded-md">{DONATION_EVENT_CATEGORIES.map(c => (<option key={c.value} value={c.value}>{c.label}</option>))}</select></div>
              <div><label className="block text-sm font-medium">Donor Name *</label><input type="text" value={editDonorName} onChange={e => setEditDonorName(e.target.value)} className={`w-full px-3 py-2 border rounded-md ${errors.donorName ? "border-red-500" : "border-gray-300"}`} />{errors.donorName && <p className="text-sm text-red-500">{errors.donorName}</p>}</div>
              <div><label className="block text-sm font-medium">Mobile</label><input type="text" value={editMobile} onChange={e => setEditMobile(e.target.value)} className="w-full px-3 py-2 border rounded-md" /></div>
              <div><label className="block text-sm font-medium">PAN</label><input type="text" value={editPan} onChange={e => setEditPan(e.target.value.toUpperCase())} className="w-full px-3 py-2 border rounded-md" maxLength={10} /></div>
              <div><label className="block text-sm font-medium">Amount *</label><input type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)} className={`w-full px-3 py-2 border rounded-md ${errors.amount ? "border-red-500" : "border-gray-300"}`} step="0.01" />{errors.amount && <p className="text-sm text-red-500">{errors.amount}</p>}</div>
              <div>
                <label className="block text-sm font-medium">Paid Amount</label>
                <input type="number" value={editPaidAmount} disabled className="w-full px-3 py-2 border rounded-md bg-gray-100 text-gray-500 cursor-not-allowed" step="0.01" />
              </div>

              <div>
                <label className="block text-sm font-medium">Paid Today</label>
                <input type="number" value={editPaidToday} onChange={e => setEditPaidToday(e.target.value)} className="w-full px-3 py-2 border rounded-md" step="0.01" min="0" placeholder="0.00" />
              </div>

              {(() => {
                const oldPaid = parseFloat(editPaidAmount) || 0;
                const newPaid = oldPaid + (parseFloat(editPaidToday) || 0);
                const total = parseFloat(editAmount) || 0;
                const pending = total - newPaid;
                if (total > 0) {
                  return (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Pending Amount</label>
                      <div className={`w-full px-3 py-2 border rounded-md bg-gray-50 ${pending > 0 ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}`}>
                        ₹ {Math.max(0, pending).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  );
                }
              })()}

              {((parseFloat(editPaidAmount) || 0) > 0 || (parseFloat(editPaidToday) || 0) > 0) && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Mode of Payment</label>
                    <div className="flex space-x-6">
                      {(["Cash", "Cheque", "NEFT"] as const).map((mop) => (
                        <label key={mop} className="flex items-center">
                          <input type="radio" name="editModeOfPayment" value={mop} checked={editModeOfPayment === mop} onChange={(e) => setEditModeOfPayment(e.target.value as "Cash" | "Cheque" | "NEFT")} className="h-4 w-4 text-blue-600 focus:ring-blue-500" />
                          <span className="ml-2 text-gray-700">{mop}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {requiresReferenceNumber(editModeOfPayment) && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{editModeOfPayment === "Cheque" ? "Cheque" : "Reference"} Number</label>
                      <input type="text" value={editChequeNumber} onChange={(e) => setEditChequeNumber(e.target.value)} className="w-full px-3 py-2 border rounded-md" />
                    </div>
                  )}
                </>
              )}

              <div className="flex gap-3">
                <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
                <button onClick={() => { setIsEditing(false); setEditPaidToday(""); setEditModeOfPayment(""); setEditChequeNumber(""); }} className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="bg-white p-6 rounded-lg shadow space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-xs text-gray-500">Event</p><p className="font-medium">{donation.eventCategory || "N/A"}</p></div>
                <div><p className="text-xs text-gray-500">Donor</p><p className="font-medium">{donation.donorName || "N/A"}</p></div>
                <div><p className="text-xs text-gray-500">Mobile</p><p className="font-medium">{donation.mobileNumber || "N/A"}</p></div>
                <div><p className="text-xs text-gray-500">PAN</p><p className="font-medium">{donation.panNumber || "N/A"}</p></div>
                <div><p className="text-xs text-gray-500">Amount</p><p className="font-medium">₹ {(donation.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p></div>
                <div><p className="text-xs text-gray-500">Paid</p><p className="font-medium text-green-600">₹ {(donation.paidAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p></div>
                <div><p className="text-xs text-gray-500">Pending</p><p className={`font-medium ${(donation.pendingAmount || 0) > 0 ? "text-red-600" : "text-green-600"}`}>₹ {(donation.pendingAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p></div>
                <div><p className="text-xs text-gray-500">Payment Mode</p><p className="font-medium">{donation.modeOfPayment || "N/A"}</p></div>
              </div>
              <div className="flex gap-3 pt-4 border-t">
                <button onClick={() => setIsEditing(true)} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Edit</button>
                <button onClick={() => setShowDeleteModal(true)} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700">Delete</button>
              </div>
            </div>
          )}
          {showDeleteModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
                <h3 className="text-lg font-semibold mb-3">Confirm Delete</h3>
                <p className="text-gray-600 mb-6">Are you sure?</p>
                <div className="flex justify-end gap-3">
                  <button onClick={() => setShowDeleteModal(false)} disabled={saving} className="px-4 py-2 bg-gray-100 rounded-md">Cancel</button>
                  <button onClick={handleDelete} disabled={saving} className="px-4 py-2 bg-red-600 text-white rounded-md disabled:opacity-50">{saving ? "Deleting..." : "Delete"}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}