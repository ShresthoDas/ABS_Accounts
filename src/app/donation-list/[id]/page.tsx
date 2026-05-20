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
import { dbPath, ROUTES, hasAccess, DONATION_EVENT_CATEGORIES, requiresReferenceNumber, DEFAULTS, getCurrentYearString, getCurrentYearShort } from "../../../utils/constants";

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

interface DonationItem {
  key: string;
  date?: string;
  name?: string;
  panNumber?: string;
  mobileNumber?: string;
  eventCategory?: string;
  familyDetails?: string | null;
  gotra?: string | null;
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

export default function DonationDetailPage() {
  const { user } = useAuth();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [donation, setDonation] = useState<DonationItem | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const router = useRouter();
  const params = useParams();

  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [eventCategory, setEventCategory] = useState("");
  const [familyDetails, setFamilyDetails] = useState("");
  const [gotra, setGotra] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [modeOfPayment, setModeOfPayment] = useState<PaymentMode | "">("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [inputBy, setInputBy] = useState("");

  useEffect(() => {
    if (user) {
      getUserDoc(user.uid).then((data) => setUserData(data)).finally(() => setLoading(false));
    }
  }, [user]);

  useEffect(() => {
    if (userData && params.id) fetchDonationDetail();
  }, [userData, params.id]);

  const fetchDonationDetail = async () => {
    try {
      setLoading(true);
      const currentYear = getCurrentYearString();
      const snapshot = await get(ref(db, `${dbPath.donations(currentYear)}/${params.id}`));
      if (snapshot.exists()) {
        const data = snapshot.val();
        const item: DonationItem = { key: params.id as string, ...data };
        setDonation(item);
        setDate(item.date || "");
        setName(item.name || "");
        setPanNumber(item.panNumber || "");
        setMobileNumber(item.mobileNumber || "");
        setEventCategory(item.eventCategory || "");
        setFamilyDetails(item.familyDetails || "");
        setGotra(item.gotra || "");
        setTotalAmount(item.totalAmount?.toString() || "");
        setPaidAmount(item.paidAmount?.toString() || "");
        setModeOfPayment((item.modeOfPayment as PaymentMode) || "");
        setChequeNumber(item.chequeNumber || "");
        setInputBy(item.inputBy || "");
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

  const handleDelete = async () => {
    if (!donation || !userData || !user) return;
    try {
      setSaving(true);
      const currentYear = getCurrentYearString();
      const donationRef = ref(db, `${dbPath.donations(currentYear)}/${params.id}`);
      const oldData = { ...donation };

      if (donation.incomeKey && donation.paidAmount && donation.paidAmount > 0) {
        const incomeRef = ref(db, `${dbPath.income(currentYear)}/${donation.incomeKey}`);
        const incomeSnapshot = await get(incomeRef);
        if (incomeSnapshot.exists()) await remove(incomeRef);

        const totalIncomeRef = ref(db, dbPath.totalIncome(currentYear));
        const totalSnapshot = await get(totalIncomeRef);
        if (totalSnapshot.exists()) await set(totalIncomeRef, roundMoney(Math.max(0, totalSnapshot.val() - donation.paidAmount)));
      }

      await remove(donationRef);

      await logAudit({
        action: "DELETE", entityType: "Donation", entityId: params.id as string,
        previousData: oldData, newData: null,
        changedBy: userData.name || user.email || "Unknown", changedByUid: user.uid,
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

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!donation || !userData || !user) return;

    const newPaid = roundMoney(parseFloat(paidAmount) || 0);
    const newTotal = roundMoney(parseFloat(totalAmount) || 0);
    const newPending = roundMoney(newTotal - newPaid);

    if (!name.trim() || !panNumber.trim() || !mobileNumber.trim() || !eventCategory || newTotal <= 0) {
      alert("Please fill in all required fields."); return;
    }
    if (newPaid > newTotal) { alert("Paid amount cannot exceed total amount."); return; }
    if (newPaid > 0 && !modeOfPayment) { alert("Please select a mode of payment when paid amount > 0."); return; }

    try {
      setSaving(true);
      const currentYear = getCurrentYearString();
      const donationRef = ref(db, `${dbPath.donations(currentYear)}/${params.id}`);
      const oldData = { ...donation };
      const oldPaidAmount = donation.paidAmount || 0;
      const paidDifference = newPaid - oldPaidAmount;

      const updatedData: Record<string, any> = {
        date, name: name.trim(), panNumber: panNumber.trim().toUpperCase(), mobileNumber: mobileNumber.trim(),
        eventCategory, familyDetails: familyDetails.trim() || null, gotra: gotra.trim() || null,
        totalAmount: newTotal, paidAmount: newPaid, pendingAmount: newPending,
        inputBy: inputBy || userData.name,
        updatedAt: new Date().toISOString(), updatedBy: user.uid,
      };

      if (paidDifference !== 0) {
        let existingIncomeData = null;
        if (donation.incomeKey) {
          const incomeRef = ref(db, `${dbPath.income(currentYear)}/${donation.incomeKey}`);
          const incomeSnapshot = await get(incomeRef);
          if (incomeSnapshot.exists()) existingIncomeData = incomeSnapshot.val();
        }

        if (newPaid > 0) {
          if (existingIncomeData) {
            await update(ref(db, `${dbPath.income(currentYear)}/${donation.incomeKey}`), {
              amount: newPaid, modeOfPayment, chequeNumber: requiresReferenceNumber(modeOfPayment) ? chequeNumber : null,
              name: name.trim(), mobileNumber: mobileNumber.trim(), panNumber: panNumber.trim().toUpperCase(), date,
            });
          } else {
            const receiptYear = getCurrentYearShort();
            const counterSnapshot = await get(ref(db, dbPath.receiptCounter(receiptYear)));
            let nextReceiptNum = 1;
            if (counterSnapshot.exists()) nextReceiptNum = counterSnapshot.val() + 1;
            const newReceiptNumber = `ABS/${receiptYear}/${nextReceiptNum}`;
            const newIncomeRef = push(ref(db, dbPath.income(currentYear)));
            const incomeKey = newIncomeRef.key;
            const incomeData = {
              key: incomeKey, date, receiptNumber: newReceiptNumber,
              name: name.trim(), mobileNumber: mobileNumber.trim(), panNumber: panNumber.trim().toUpperCase(),
              amount: newPaid, category: DEFAULTS.DONATION_INCOME_CATEGORY, modeOfPayment,
              chequeNumber: requiresReferenceNumber(modeOfPayment) ? chequeNumber : null,
              inputBy: inputBy || userData.name, createdAt: new Date().toISOString(), createdBy: user.uid,
              donationLink: params.id,
            };
            await set(newIncomeRef, incomeData);
            await set(ref(db, dbPath.receiptCounter(receiptYear)), nextReceiptNum);
            updatedData.incomeKey = incomeKey;
            updatedData.receiptNumber = newReceiptNumber;
            generateReceiptPDF(incomeData);
          }

          const totalIncomeRef = ref(db, dbPath.totalIncome(currentYear));
          const totalSnapshot = await get(totalIncomeRef);
          await set(totalIncomeRef, roundMoney(Math.max(0, (totalSnapshot.exists() ? totalSnapshot.val() : 0) + paidDifference)));
        } else {
          if (donation.incomeKey) {
            await remove(ref(db, `${dbPath.income(currentYear)}/${donation.incomeKey}`));
            const totalIncomeRef = ref(db, dbPath.totalIncome(currentYear));
            const totalSnapshot = await get(totalIncomeRef);
            if (totalSnapshot.exists()) await set(totalIncomeRef, roundMoney(Math.max(0, totalSnapshot.val() - oldPaidAmount)));
          }
          updatedData.incomeKey = null; updatedData.receiptNumber = null;
          updatedData.modeOfPayment = null; updatedData.chequeNumber = null;
        }
      } else if (newPaid > 0 && (modeOfPayment !== donation.modeOfPayment || chequeNumber !== donation.chequeNumber)) {
        updatedData.modeOfPayment = modeOfPayment;
        updatedData.chequeNumber = requiresReferenceNumber(modeOfPayment) ? chequeNumber : null;
        if (donation.incomeKey) {
          await update(ref(db, `${dbPath.income(currentYear)}/${donation.incomeKey}`), {
            modeOfPayment, chequeNumber: requiresReferenceNumber(modeOfPayment) ? chequeNumber : null,
          });
        }
      }

      await update(donationRef, updatedData);

      await logAudit({
        action: "UPDATE", entityType: "Donation", entityId: params.id as string,
        previousData: oldData, newData: { ...oldData, ...updatedData },
        changedBy: userData.name || user.email || "Unknown", changedByUid: user.uid,
        changedAt: new Date().toISOString(),
      });

      alert("Donation updated successfully!");
      setIsEditing(false);
      fetchDonationDetail();
    } catch (error) {
      console.error("Error updating donation:", error);
      alert("Error updating donation. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const canAccess = userData && hasAccess(userData.userType);

  if (loading) return (<ProtectedRoute><div className="min-h-screen flex items-center justify-center bg-gray-50"><div>Loading...</div></div></ProtectedRoute>);
  if (!canAccess) return (
    <ProtectedRoute><div className="min-h-screen bg-gray-50 py-8 px-4"><div className="max-w-4xl mx-auto">
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md"><p className="font-medium">Access Denied</p></div>
      <button onClick={() => router.push(ROUTES.DASHBOARD)} className="mt-4 text-blue-600 hover:text-blue-800">← Back to Dashboard</button>
    </div></div></ProtectedRoute>
  );
  if (!donation) return (
    <ProtectedRoute><div className="min-h-screen bg-gray-50 py-8 px-4"><div className="max-w-4xl mx-auto">
      <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-md">Donation record not found.</div>
      <button onClick={() => router.push(ROUTES.DONATION_LIST)} className="mt-4 text-blue-600 hover:text-blue-800">← Back to Donation List</button>
    </div></div></ProtectedRoute>
  );

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center mb-6">
            <button onClick={() => router.push(ROUTES.DONATION_LIST)} className="mr-4 text-blue-600 hover:text-blue-800">← Back to Donation List</button>
            <h1 className="text-3xl font-bold">{isEditing ? "Edit Donation" : "Donation Details"}</h1>
          </div>

          {isEditing ? (
            <div className="bg-white p-6 rounded-lg shadow">
              <form onSubmit={handleEdit} className="space-y-6">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" required /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label><input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" required /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">PAN Number <span className="text-red-500">*</span></label><input type="text" value={panNumber} onChange={(e) => setPanNumber(e.target.value.toUpperCase())} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" maxLength={10} required /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Mobile Number <span className="text-red-500">*</span></label><input type="tel" value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" maxLength={10} required /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Event Category <span className="text-red-500">*</span></label>
                  <select value={eventCategory} onChange={(e) => setEventCategory(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                    <option value="">-- Select Event Category --</option>
                    {DONATION_EVENT_CATEGORIES.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
                  </select>
                </div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Family Details</label><textarea value={familyDetails} onChange={(e) => setFamilyDetails(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" rows={2} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Gotra</label><input type="text" value={gotra} onChange={(e) => setGotra(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Total Amount (₹) <span className="text-red-500">*</span></label><input type="number" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" step="0.01" min="0" required /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Paid Amount (₹) <span className="text-red-500">*</span></label><input type="number" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" step="0.01" min="0" required /></div>
                {(() => { const p = roundMoney(parseFloat(paidAmount) || 0); const t = roundMoney(parseFloat(totalAmount) || 0); const pend = roundMoney(t - p); if (t > 0) return (<div><label className="block text-sm font-medium text-gray-700 mb-1">Pending Amount</label><div className={`w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 ${pend > 0 ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}`}>₹ {Math.max(0, pend).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div></div>); })()}
                {(roundMoney(parseFloat(paidAmount) || 0)) > 0 && (
                  <>
                    <div><label className="block text-sm font-medium text-gray-700 mb-2">Mode of Payment <span className="text-red-500">*</span></label>
                      <div className="flex space-x-6">{(["Cash", "Cheque", "NEFT"] as PaymentMode[]).map((mop) => (<label key={mop} className="flex items-center"><input type="radio" name="editMoP" value={mop} checked={modeOfPayment === mop} onChange={(e) => setModeOfPayment(e.target.value as PaymentMode)} className="h-4 w-4 text-blue-600 focus:ring-blue-500" /><span className="ml-2 text-gray-700">{mop}</span></label>))}</div>
                    </div>
                    {requiresReferenceNumber(modeOfPayment) && (<div><label className="block text-sm font-medium text-gray-700 mb-1">{modeOfPayment === "Cheque" ? "Cheque" : "Reference"} Number <span className="text-red-500">*</span></label><input type="text" value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" required /></div>)}
                  </>
                )}
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Input By</label><input type="text" value={inputBy} onChange={(e) => setInputBy(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                <div className="flex gap-3">
                  <button type="submit" disabled={saving} className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium disabled:opacity-50">{saving ? "Saving..." : "Save Changes"}</button>
                  <button type="button" onClick={() => { setIsEditing(false); if (donation) { setDate(donation.date || ""); setName(donation.name || ""); setPanNumber(donation.panNumber || ""); setMobileNumber(donation.mobileNumber || ""); setEventCategory(donation.eventCategory || ""); setFamilyDetails(donation.familyDetails || ""); setGotra(donation.gotra || ""); setTotalAmount(donation.totalAmount?.toString() || ""); setPaidAmount(donation.paidAmount?.toString() || ""); setModeOfPayment((donation.modeOfPayment as PaymentMode) || ""); setChequeNumber(donation.chequeNumber || ""); setInputBy(donation.inputBy || ""); } }} className="flex-1 bg-gray-300 text-gray-700 py-3 px-4 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 font-medium">Cancel</button>
                </div>
              </form>
            </div>
          ) : (
            <>
              <div className="flex gap-3 mb-6">
                <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>Edit
                </button>
                <button onClick={() => setShowDeleteConfirm(true)} className="flex items-center gap-2 bg-red-600 text-white px-5 py-2.5 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 font-medium">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>Delete
                </button>
              </div>

              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="bg-rose-500 text-white p-6">
                  <h2 className="text-2xl font-bold">{donation.name}</h2>
                  <p className="text-rose-100 mt-1">{donation.date ? new Date(donation.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : ''}</p>
                </div>
                <div className="p-6 space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">Donor Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div><p className="text-sm text-gray-500">Name</p><p className="text-base font-medium text-gray-900">{donation.name}</p></div>
                      <div><p className="text-sm text-gray-500">Mobile Number</p><p className="text-base font-medium text-gray-900">{donation.mobileNumber || '-'}</p></div>
                      <div><p className="text-sm text-gray-500">PAN Number</p><p className="text-base font-medium text-gray-900">{donation.panNumber || '-'}</p></div>
                      <div><p className="text-sm text-gray-500">Event Category</p><p className="text-base font-medium text-gray-900"><span className="inline-flex px-2 py-0.5 rounded text-sm font-medium bg-rose-100 text-rose-800">{donation.eventCategory || '-'}</span></p></div>
                      <div><p className="text-sm text-gray-500">Family Details</p><p className="text-base font-medium text-gray-900">{donation.familyDetails || '-'}</p></div>
                      <div><p className="text-sm text-gray-500">Gotra</p><p className="text-base font-medium text-gray-900">{donation.gotra || '-'}</p></div>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">Payment Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-gray-50 p-3 rounded"><p className="text-sm text-gray-500">Total Amount</p><p className="text-xl font-bold text-gray-900">₹ {(donation.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p></div>
                      <div className="bg-green-50 p-3 rounded"><p className="text-sm text-gray-500">Paid Amount</p><p className="text-xl font-bold text-green-600">₹ {(donation.paidAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p></div>
                      <div className={`p-3 rounded ${(donation.pendingAmount || 0) > 0 ? 'bg-red-50' : 'bg-green-50'}`}><p className="text-sm text-gray-500">Pending Amount</p><p className={`text-xl font-bold ${(donation.pendingAmount || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>₹ {(donation.pendingAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p></div>
                      {donation.modeOfPayment && <div><p className="text-sm text-gray-500">Mode of Payment</p><p className="text-base font-medium text-gray-900">{donation.modeOfPayment}</p></div>}
                      {donation.chequeNumber && <div><p className="text-sm text-gray-500">{donation.modeOfPayment === 'Cheque' ? 'Cheque' : 'Reference'} Number</p><p className="text-base font-medium text-gray-900">{donation.chequeNumber}</p></div>}
                      {donation.receiptNumber && <div><p className="text-sm text-gray-500">Receipt Number</p><p className="text-base font-medium text-gray-900">{donation.receiptNumber}</p></div>}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">Record Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div><p className="text-sm text-gray-500">Input By</p><p className="text-base font-medium text-gray-900">{donation.inputBy || '-'}</p></div>
                      <div><p className="text-sm text-gray-500">Created At</p><p className="text-base font-medium text-gray-900">{donation.createdAt ? new Date(donation.createdAt).toLocaleString('en-IN') : '-'}</p></div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {showDeleteConfirm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Confirm Delete</h2>
                <p className="text-gray-600 mb-2">Are you sure you want to delete this donation?</p>
                <p className="text-sm text-red-600 mb-6">Name: <strong>{donation.name}</strong> — Total: ₹ {(donation.totalAmount || 0).toLocaleString('en-IN')}<br />{donation.incomeKey && "Linked income record and total income will also be adjusted. "}This action cannot be undone.</p>
                <div className="flex gap-3">
                  <button onClick={handleDelete} disabled={saving} className="flex-1 bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 font-medium disabled:opacity-50">{saving ? "Deleting..." : "Yes, Delete"}</button>
                  <button onClick={() => setShowDeleteConfirm(false)} disabled={saving} className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 font-medium">Cancel</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}