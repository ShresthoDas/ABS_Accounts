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
import { dbPath, ROUTES, requiresReferenceNumber, DEFAULTS, getCurrentYearShort } from "../../../utils/constants";
import { useFinancialYear } from "../../../context/FinancialYearContext";

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

interface SpotCollectionItem {
  key: string;
  date?: string;
  receiptNumber?: string;
  name?: string;
  panNumber?: string;
  mobileNumber?: string | null;
  amount?: number;
  modeOfPayment?: string;
  chequeNumber?: string | null;
  incomeKey?: string;
  inputBy?: string;
  createdBy?: string;
  createdAt?: string;
  [key: string]: any;
}

type PaymentMode = "Cash" | "Cheque" | "NEFT";

const SPOT_COLLECTION_ALLOWED_TYPES = ["Accounts", "GB", "Front Office"];

export default function SpotCollectionDetailPage() {
  const { user } = useAuth();
  const { selectedYear } = useFinancialYear();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [record, setRecord] = useState<SpotCollectionItem | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const router = useRouter();
  const params = useParams();

  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [modeOfPayment, setModeOfPayment] = useState<PaymentMode | "">("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [inputBy, setInputBy] = useState("");

  useEffect(() => {
    if (user) {
      getUserDoc(user.uid).then((data) => setUserData(data)).finally(() => setLoading(false));
    }
  }, [user]);

  useEffect(() => {
    if (userData && params.id) fetchDetail();
  }, [userData, params.id]);

  const fetchDetail = async () => {
    try {
      setLoading(true);
      const currentYear = selectedYear;
      const snapshot = await get(ref(db, `${dbPath.spotCollection(currentYear)}/${params.id}`));
      if (snapshot.exists()) {
        const data = snapshot.val();
        const item: SpotCollectionItem = { key: params.id as string, ...data };
        setRecord(item);
        setDate(item.date || "");
        setName(item.name || "");
        setMobileNumber(item.mobileNumber || "");
        setPanNumber(item.panNumber || "");
        setAmount(item.amount?.toString() || "");
        setModeOfPayment((item.modeOfPayment as PaymentMode) || "");
        setChequeNumber(item.chequeNumber || "");
        setInputBy(item.inputBy || "");
      } else {
        setRecord(null);
      }
    } catch (error) {
      console.error("Error fetching spot collection:", error);
      setRecord(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!record || !userData || !user) return;
    try {
      setSaving(true);
      const currentYear = selectedYear;
      const recordRef = ref(db, `${dbPath.spotCollection(currentYear)}/${params.id}`);
      const oldData = { ...record };

      if (record.incomeKey && record.amount && record.amount > 0) {
        const incomeRef = ref(db, `${dbPath.income(currentYear)}/${record.incomeKey}`);
        const incomeSnapshot = await get(incomeRef);
        if (incomeSnapshot.exists()) await remove(incomeRef);

        const totalIncomeRef = ref(db, dbPath.totalIncome(currentYear));
        const totalSnapshot = await get(totalIncomeRef);
        if (totalSnapshot.exists()) await set(totalIncomeRef, roundMoney(Math.max(0, totalSnapshot.val() - record.amount)));
      }

      await remove(recordRef);

      await logAudit({
        action: "DELETE", entityType: "SpotCollection", entityId: params.id as string,
        previousData: oldData, newData: null,
        changedBy: userData.name || user.email || "Unknown", changedByUid: user.uid,
        changedAt: new Date().toISOString(),
      });

      alert("Spot Collection deleted successfully!");
      router.push(ROUTES.SPOT_COLLECTION_LIST);
    } catch (error) {
      console.error("Error deleting spot collection:", error);
      alert("Error deleting spot collection. Please try again.");
    } finally {
      setSaving(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!record || !userData || !user) return;

    const newAmount = roundMoney(parseFloat(amount) || 0);

    if (!name.trim() || !panNumber.trim() || newAmount <= 0) {
      alert("Please fill in all required fields."); return;
    }
    if (!modeOfPayment) { alert("Please select a mode of payment."); return; }
    if (requiresReferenceNumber(modeOfPayment) && !chequeNumber.trim()) {
      alert(`Cheque/Reference number is mandatory for ${modeOfPayment}.`); return;
    }

    try {
      setSaving(true);
      const currentYear = selectedYear;
      const recordRef = ref(db, `${dbPath.spotCollection(currentYear)}/${params.id}`);
      const oldData = { ...record };
      const oldAmount = roundMoney(record.amount || 0);
      const amountDifference = roundMoney(newAmount - oldAmount);

      const updatedData: Record<string, any> = {
        date, name: name.trim(), mobileNumber: mobileNumber.trim() || null,
        panNumber: panNumber.trim().toUpperCase(), amount: newAmount,
        modeOfPayment,
        chequeNumber: requiresReferenceNumber(modeOfPayment) ? chequeNumber : null,
        inputBy: inputBy || userData.name,
        updatedAt: new Date().toISOString(), updatedBy: user.uid,
      };

      if (amountDifference !== 0) {
        let existingIncomeData = null;
        if (record.incomeKey) {
          const incomeRef = ref(db, `${dbPath.income(currentYear)}/${record.incomeKey}`);
          const incomeSnapshot = await get(incomeRef);
          if (incomeSnapshot.exists()) existingIncomeData = incomeSnapshot.val();
        }

        if (newAmount > 0) {
          if (existingIncomeData) {
            await update(ref(db, `${dbPath.income(currentYear)}/${record.incomeKey}`), {
              amount: newAmount, modeOfPayment,
              chequeNumber: requiresReferenceNumber(modeOfPayment) ? chequeNumber : null,
              name: name.trim(), mobileNumber: mobileNumber.trim() || null,
              panNumber: panNumber.trim().toUpperCase(), date,
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
              name: name.trim(), mobileNumber: mobileNumber.trim() || null,
              panNumber: panNumber.trim().toUpperCase(),
              amount: newAmount, category: DEFAULTS.SPOT_COLLECTION_INCOME_CATEGORY, modeOfPayment,
              chequeNumber: requiresReferenceNumber(modeOfPayment) ? chequeNumber : null,
              inputBy: inputBy || userData.name, createdAt: new Date().toISOString(), createdBy: user.uid,
              spotCollectionLink: params.id,
            };
            await set(newIncomeRef, incomeData);
            await set(ref(db, dbPath.receiptCounter(receiptYear)), nextReceiptNum);
            updatedData.incomeKey = incomeKey;
            updatedData.receiptNumber = newReceiptNumber;
            generateReceiptPDF(incomeData);
          }

          const totalIncomeRef = ref(db, dbPath.totalIncome(currentYear));
          const totalSnapshot = await get(totalIncomeRef);
          await set(totalIncomeRef, roundMoney(Math.max(0, (totalSnapshot.exists() ? totalSnapshot.val() : 0) + amountDifference)));
        } else {
          if (record.incomeKey) {
            await remove(ref(db, `${dbPath.income(currentYear)}/${record.incomeKey}`));
            const totalIncomeRef = ref(db, dbPath.totalIncome(currentYear));
            const totalSnapshot = await get(totalIncomeRef);
            if (totalSnapshot.exists()) await set(totalIncomeRef, roundMoney(Math.max(0, totalSnapshot.val() - oldAmount)));
          }
          updatedData.incomeKey = null; updatedData.receiptNumber = null;
        }
      } else if (modeOfPayment !== record.modeOfPayment || chequeNumber !== record.chequeNumber) {
        if (record.incomeKey) {
          await update(ref(db, `${dbPath.income(currentYear)}/${record.incomeKey}`), {
            modeOfPayment, chequeNumber: requiresReferenceNumber(modeOfPayment) ? chequeNumber : null,
          });
        }
      }

      await update(recordRef, updatedData);

      await logAudit({
        action: "UPDATE", entityType: "SpotCollection", entityId: params.id as string,
        previousData: oldData, newData: { ...oldData, ...updatedData },
        changedBy: userData.name || user.email || "Unknown", changedByUid: user.uid,
        changedAt: new Date().toISOString(),
      });

      alert("Spot Collection updated successfully!");
      setIsEditing(false);
      fetchDetail();
    } catch (error) {
      console.error("Error updating spot collection:", error);
      alert("Error updating spot collection. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const canAccess = userData && SPOT_COLLECTION_ALLOWED_TYPES.includes(userData.userType);

  if (loading) return (<ProtectedRoute><div className="min-h-screen flex items-center justify-center bg-gray-50"><div>Loading...</div></div></ProtectedRoute>);
  if (!canAccess) return (
    <ProtectedRoute><div className="min-h-screen bg-gray-50 py-8 px-4"><div className="max-w-4xl mx-auto">
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md"><p className="font-medium">Access Denied</p></div>
      <button onClick={() => router.push(ROUTES.DASHBOARD)} className="mt-4 text-blue-600 hover:text-blue-800">← Back to Dashboard</button>
    </div></div></ProtectedRoute>
  );
  if (!record) return (
    <ProtectedRoute><div className="min-h-screen bg-gray-50 py-8 px-4"><div className="max-w-4xl mx-auto">
      <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-md">Spot Collection record not found.</div>
      <button onClick={() => router.push(ROUTES.SPOT_COLLECTION_LIST)} className="mt-4 text-blue-600 hover:text-blue-800">← Back to Spot Collection List</button>
    </div></div></ProtectedRoute>
  );

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center mb-6">
            <button onClick={() => router.push(ROUTES.SPOT_COLLECTION_LIST)} className="mr-4 text-blue-600 hover:text-blue-800">← Back to Spot Collection List</button>
            <h1 className="text-3xl font-bold">{isEditing ? "Edit Spot Collection" : "Spot Collection Details"}</h1>
          </div>

          {isEditing ? (
            <div className="bg-white p-6 rounded-lg shadow">
              <form onSubmit={handleEdit} className="space-y-6">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" required /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label><input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" required /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Mobile Number</label><input type="tel" value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" maxLength={10} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">PAN Number <span className="text-red-500">*</span></label><input type="text" value={panNumber} onChange={(e) => setPanNumber(e.target.value.toUpperCase())} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" maxLength={10} required /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹) <span className="text-red-500">*</span></label><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" step="0.01" min="0" required /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-2">Mode of Payment <span className="text-red-500">*</span></label>
                  <div className="flex space-x-6">{(["Cash", "Cheque", "NEFT"] as PaymentMode[]).map((mop) => (<label key={mop} className="flex items-center"><input type="radio" name="editMoP" value={mop} checked={modeOfPayment === mop} onChange={(e) => setModeOfPayment(e.target.value as PaymentMode)} className="h-4 w-4 text-blue-600 focus:ring-blue-500" /><span className="ml-2 text-gray-700">{mop}</span></label>))}</div>
                </div>
                {requiresReferenceNumber(modeOfPayment) && (<div><label className="block text-sm font-medium text-gray-700 mb-1">{modeOfPayment === "Cheque" ? "Cheque" : "Reference"} Number <span className="text-red-500">*</span></label><input type="text" value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" required /></div>)}
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Input By</label><input type="text" value={inputBy} onChange={(e) => setInputBy(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                <div className="flex gap-3">
                  <button type="submit" disabled={saving} className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium disabled:opacity-50">{saving ? "Saving..." : "Save Changes"}</button>
                  <button type="button" onClick={() => { setIsEditing(false); if (record) { setDate(record.date || ""); setName(record.name || ""); setMobileNumber(record.mobileNumber || ""); setPanNumber(record.panNumber || ""); setAmount(record.amount?.toString() || ""); setModeOfPayment((record.modeOfPayment as PaymentMode) || ""); setChequeNumber(record.chequeNumber || ""); setInputBy(record.inputBy || ""); } }} className="flex-1 bg-gray-300 text-gray-700 py-3 px-4 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 font-medium">Cancel</button>
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
                <div className="bg-blue-500 text-white p-6">
                  <h2 className="text-2xl font-bold">{record.name}</h2>
                  <p className="text-blue-100 mt-1">{record.date ? new Date(record.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : ''}</p>
                  {record.receiptNumber && <p className="text-blue-100 mt-1 text-sm">Receipt #{record.receiptNumber}</p>}
                </div>
                <div className="p-6 space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">Donor Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div><p className="text-sm text-gray-500">Name</p><p className="text-base font-medium text-gray-900">{record.name}</p></div>
                      <div><p className="text-sm text-gray-500">Mobile Number</p><p className="text-base font-medium text-gray-900">{record.mobileNumber || '-'}</p></div>
                      <div><p className="text-sm text-gray-500">PAN Number</p><p className="text-base font-medium text-gray-900">{record.panNumber || '-'}</p></div>
                      <div><p className="text-sm text-gray-500">Category</p><p className="text-base font-medium text-gray-900"><span className="inline-flex px-2 py-0.5 rounded text-sm font-medium bg-blue-100 text-blue-800">{record.category || 'Spot Collection'}</span></p></div>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">Payment Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-gray-50 p-3 rounded"><p className="text-sm text-gray-500">Amount</p><p className="text-xl font-bold text-gray-900">₹ {(record.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p></div>
                      <div><p className="text-sm text-gray-500">Mode of Payment</p><p className="text-base font-medium text-gray-900">{record.modeOfPayment || '-'}</p></div>
                      {record.chequeNumber && <div><p className="text-sm text-gray-500">{record.modeOfPayment === 'Cheque' ? 'Cheque' : 'Reference'} Number</p><p className="text-base font-medium text-gray-900">{record.chequeNumber}</p></div>}
                      {record.receiptNumber && <div><p className="text-sm text-gray-500">Receipt Number</p><p className="text-base font-medium text-gray-900">{record.receiptNumber}</p></div>}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">Record Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div><p className="text-sm text-gray-500">Input By</p><p className="text-base font-medium text-gray-900">{record.inputBy || '-'}</p></div>
                      <div><p className="text-sm text-gray-500">Created At</p><p className="text-base font-medium text-gray-900">{record.createdAt ? new Date(record.createdAt).toLocaleString('en-IN') : '-'}</p></div>
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
                <p className="text-gray-600 mb-2">Are you sure you want to delete this spot collection?</p>
                <p className="text-sm text-red-600 mb-6">Name: <strong>{record.name}</strong> — Amount: ₹ {(record.amount || 0).toLocaleString('en-IN')}<br />{record.incomeKey && "Linked income record and total income will also be adjusted. "}This action cannot be undone.</p>
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