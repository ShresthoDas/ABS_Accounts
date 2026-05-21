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
import { dbPath, ROUTES, hasAccess, AD_TYPES, requiresReferenceNumber, DEFAULTS, getCurrentYearString, getCurrentYearShort } from "../../../utils/constants";

// Helper to round monetary values to 2 decimal places (avoids floating point issues like 30000 - 0 = 29999.9995)
const roundMoney = (value: number): number => Math.round(value * 100) / 100;

interface AdItem {
  key: string;
  date?: string;
  name?: string;
  panNumber?: string;
  mobileNumber?: string;
  adType?: string;
  size?: string;
  videoLength?: string;
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

export default function AdDetailPage() {
  const { user } = useAuth();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ad, setAd] = useState<AdItem | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const router = useRouter();
  const params = useParams();

  // Edit form state
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [adType, setAdType] = useState("");
  const [size, setSize] = useState("");
  const [videoLength, setVideoLength] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [totalAmount, setTotalAmount] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [modeOfPayment, setModeOfPayment] = useState<PaymentMode | "">("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [inputBy, setInputBy] = useState("");

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (user) {
      getUserDoc(user.uid)
        .then((data) => setUserData(data))
        .finally(() => setLoading(false));
    }
  }, [user]);

  useEffect(() => {
    if (userData && params.id) {
      fetchAdDetail();
    }
  }, [userData, params.id]);

  const fetchAdDetail = async () => {
    try {
      setLoading(true);
      const currentYear = getCurrentYearString();
      const adRef = ref(db, `${dbPath.ads(currentYear)}/${params.id}`);
      const snapshot = await get(adRef);

      if (snapshot.exists()) {
        const data = snapshot.val();
        const adItem: AdItem = { key: params.id as string, ...data };
        setAd(adItem);
        // Populate edit form
        setDate(adItem.date || "");
        setName(adItem.name || "");
        setPanNumber(adItem.panNumber || "");
        setMobileNumber(adItem.mobileNumber || "");
        setAdType(adItem.adType || "");
        setSize(adItem.size || "");
        setVideoLength(adItem.videoLength || "");
        setQuantity(adItem.quantity?.toString() || "1");
        setTotalAmount(adItem.totalAmount?.toString() || "");
        setPaidAmount(adItem.paidAmount?.toString() || "");
        setModeOfPayment((adItem.modeOfPayment as PaymentMode) || "");
        setChequeNumber(adItem.chequeNumber || "");
        setInputBy(adItem.inputBy || "");
      } else {
        setAd(null);
      }
    } catch (error) {
      console.error("Error fetching ad:", error);
      setAd(null);
    } finally {
      setLoading(false);
    }
  };

  const validateEditForm = () => {
    const newErrors: Record<string, string> = {};
    const paid = roundMoney(parseFloat(paidAmount) || 0);

    if (!name.trim()) {
      newErrors.name = "Name is mandatory";
    }

    if (!panNumber.trim()) {
      newErrors.panNumber = "PAN Number is mandatory";
    }

    if (!mobileNumber.trim()) {
      newErrors.mobileNumber = "Mobile number is mandatory";
    } else if (!/^\d{10}$/.test(mobileNumber.trim())) {
      newErrors.mobileNumber = "Enter a valid 10-digit mobile number";
    }

    if (!adType) {
      newErrors.adType = "Please select an ad type";
    }

    if (adType === "Banner" && !size.trim()) {
      newErrors.size = "Please enter the banner size";
    }

    if (adType === "LED" && !videoLength.trim()) {
      newErrors.videoLength = "Please enter the video length";
    }

    const total = roundMoney(parseFloat(totalAmount) || 0);
    if (total <= 0) {
      newErrors.totalAmount = "Total amount must be greater than 0";
    }

    if (paid > total) {
      newErrors.paidAmount = "Paid amount cannot exceed total amount";
    }

    if (paid > 0 && !modeOfPayment) {
      newErrors.modeOfPayment = "Please select a mode of payment";
    }

    if (paid > 0 && requiresReferenceNumber(modeOfPayment) && !chequeNumber.trim()) {
      newErrors.chequeNumber = "Cheque/Reference number is mandatory for " + modeOfPayment;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleDelete = async () => {
    if (!ad || !userData || !user) return;
    try {
      setSaving(true);
      const currentYear = getCurrentYearString();
      const adRef = ref(db, `${dbPath.ads(currentYear)}/${params.id}`);
      const oldData = { ...ad };

      // If there's a linked income record, remove it and adjust total income
      if (ad.incomeKey && ad.paidAmount && ad.paidAmount > 0) {
        const incomeRef = ref(db, `${dbPath.income(currentYear)}/${ad.incomeKey}`);
        const incomeSnapshot = await get(incomeRef);
        if (incomeSnapshot.exists()) {
          await remove(incomeRef);
        }

        const totalIncomeRef = ref(db, dbPath.totalIncome(currentYear));
        const totalSnapshot = await get(totalIncomeRef);
        if (totalSnapshot.exists()) {
          await set(totalIncomeRef, Math.max(0, totalSnapshot.val() - ad.paidAmount));
        }
      }

      // Remove the ad record
      await remove(adRef);

      await logAudit({
        action: "DELETE",
        entityType: "Ad",
        entityId: params.id as string,
        previousData: oldData,
        newData: null,
        changedBy: userData.name || user.email || "Unknown",
        changedByUid: user.uid,
        changedAt: new Date().toISOString(),
      });

      alert("Advertisement booking deleted successfully!");
      router.push(ROUTES.AD_LIST);
    } catch (error) {
      console.error("Error deleting ad:", error);
      alert("Error deleting ad. Please try again.");
    } finally {
      setSaving(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ad || !userData || !user) return;

    if (!validateEditForm()) return;

    const newPaid = roundMoney(parseFloat(paidAmount) || 0);
    const newTotal = roundMoney(parseFloat(totalAmount) || 0);
    const newPending = roundMoney(newTotal - newPaid);

    try {
      setSaving(true);
      const currentYear = getCurrentYearString();
      const adRef = ref(db, `${dbPath.ads(currentYear)}/${params.id}`);
      const oldData = { ...ad };
      const oldPaidAmount = ad.paidAmount || 0;
      const paidDifference = newPaid - oldPaidAmount;

      const updatedData: Record<string, any> = {
        date,
        name: name.trim(),
        panNumber: panNumber.trim().toUpperCase(),
        mobileNumber: mobileNumber.trim(),
        adType,
        quantity: parseInt(quantity) || 1,
        totalAmount: newTotal,
        paidAmount: newPaid,
        pendingAmount: newPending,
        inputBy: inputBy || userData.name,
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid,
      };

      if (adType === "Banner") {
        updatedData.size = size.trim();
        updatedData.videoLength = null;
      } else if (adType === "LED") {
        updatedData.videoLength = videoLength.trim();
        updatedData.size = null;
      }

      // Handle income record changes based on paid amount difference
      if (paidDifference !== 0) {
        // If there was an existing income record, get its data
        let existingIncomeData = null;
        if (ad.incomeKey) {
          const incomeRef = ref(db, `${dbPath.income(currentYear)}/${ad.incomeKey}`);
          const incomeSnapshot = await get(incomeRef);
          if (incomeSnapshot.exists()) {
            existingIncomeData = incomeSnapshot.val();
          }
        }

        if (newPaid > 0) {
          // Need to create or update income record
          if (existingIncomeData) {
            // Update existing income record
            const incomeRef = ref(db, `${dbPath.income(currentYear)}/${ad.incomeKey}`);
            await update(incomeRef, {
              amount: newPaid,
              modeOfPayment,
              chequeNumber: requiresReferenceNumber(modeOfPayment) ? chequeNumber : null,
              name: name.trim(),
              mobileNumber: mobileNumber.trim(),
              panNumber: panNumber.trim().toUpperCase(),
              date,
            });
          } else {
            // Create new income record
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

            const incomeData = {
              key: incomeKey,
              date,
              receiptNumber: newReceiptNumber,
              name: name.trim(),
              mobileNumber: mobileNumber.trim(),
              panNumber: panNumber.trim().toUpperCase(),
              amount: newPaid,
              category: DEFAULTS.AD_INCOME_CATEGORY,
              modeOfPayment,
              chequeNumber: requiresReferenceNumber(modeOfPayment) ? chequeNumber : null,
              inputBy: inputBy || userData.name,
              createdAt: new Date().toISOString(),
              createdBy: user.uid,
              adLink: params.id,
            };

            await set(newIncomeRef, incomeData);
            await set(receiptCounterRef, nextReceiptNum);
            updatedData.incomeKey = incomeKey;
            updatedData.receiptNumber = newReceiptNumber;

            // Generate receipt PDF for new income
            generateReceiptPDF(incomeData);
          }

          // Update total income
          const totalIncomeRef = ref(db, dbPath.totalIncome(currentYear));
          const totalSnapshot = await get(totalIncomeRef);
          const currentTotal = totalSnapshot.exists() ? totalSnapshot.val() : 0;
          await set(totalIncomeRef, Math.max(0, currentTotal + paidDifference));
        } else {
          // Paid amount changed to 0 - remove income record if exists
          if (ad.incomeKey) {
            const incomeRef = ref(db, `${dbPath.income(currentYear)}/${ad.incomeKey}`);
            await remove(incomeRef);

            const totalIncomeRef = ref(db, dbPath.totalIncome(currentYear));
            const totalSnapshot = await get(totalIncomeRef);
            if (totalSnapshot.exists()) {
              await set(totalIncomeRef, Math.max(0, totalSnapshot.val() - oldPaidAmount));
            }
          }
          updatedData.incomeKey = null;
          updatedData.receiptNumber = null;
          updatedData.modeOfPayment = null;
          updatedData.chequeNumber = null;
        }
      } else if (newPaid > 0 && (modeOfPayment !== ad.modeOfPayment || chequeNumber !== ad.chequeNumber)) {
        // Update payment mode/cheque even if amount unchanged
        updatedData.modeOfPayment = modeOfPayment;
        updatedData.chequeNumber = requiresReferenceNumber(modeOfPayment) ? chequeNumber : null;

        if (ad.incomeKey) {
          const incomeRef = ref(db, `${dbPath.income(currentYear)}/${ad.incomeKey}`);
          await update(incomeRef, {
            modeOfPayment,
            chequeNumber: requiresReferenceNumber(modeOfPayment) ? chequeNumber : null,
          });
        }
      }

      await update(adRef, updatedData);

      await logAudit({
        action: "UPDATE",
        entityType: "Ad",
        entityId: params.id as string,
        previousData: oldData,
        newData: { ...oldData, ...updatedData },
        changedBy: userData.name || user.email || "Unknown",
        changedByUid: user.uid,
        changedAt: new Date().toISOString(),
      });

      alert("Advertisement booking updated successfully!");
      setIsEditing(false);
      fetchAdDetail();
    } catch (error) {
      console.error("Error updating ad:", error);
      alert("Error updating ad. Please try again.");
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

  if (!ad) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 py-8 px-4">
          <div className="max-w-4xl mx-auto">
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-md">Advertisement booking record not found.</div>
            <button onClick={() => router.push(ROUTES.AD_LIST)} className="mt-4 text-blue-600 hover:text-blue-800">← Back to Ad List</button>
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
            <button onClick={() => router.push(ROUTES.AD_LIST)} className="mr-4 text-blue-600 hover:text-blue-800">← Back to Ad List</button>
            <h1 className="text-3xl font-bold">{isEditing ? "Edit Advertisement Booking" : "Advertisement Booking Details"}</h1>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.name ? "border-red-500" : "border-gray-300"}`} required />
                  {errors.name && <p className="mt-1 text-sm text-red-500">{errors.name}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">PAN Number <span className="text-red-500">*</span></label>
                  <input type="text" value={panNumber} onChange={(e) => setPanNumber(e.target.value.toUpperCase())} className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.panNumber ? "border-red-500" : "border-gray-300"}`} maxLength={10} required />
                  {errors.panNumber && <p className="mt-1 text-sm text-red-500">{errors.panNumber}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Number <span className="text-red-500">*</span></label>
                  <input type="tel" value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)} className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.mobileNumber ? "border-red-500" : "border-gray-300"}`} maxLength={10} required />
                  {errors.mobileNumber && <p className="mt-1 text-sm text-red-500">{errors.mobileNumber}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ad Type <span className="text-red-500">*</span></label>
                  <select value={adType} onChange={(e) => { setAdType(e.target.value); setErrors({ ...errors, adType: "" }); }} className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.adType ? "border-red-500" : "border-gray-300"}`} required>
                    <option value="">-- Select Ad Type --</option>
                    {AD_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
                  </select>
                  {errors.adType && <p className="mt-1 text-sm text-red-500">{errors.adType}</p>}
                </div>

                {adType === "Banner" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Size <span className="text-red-500">*</span></label>
                    <input type="text" value={size} onChange={(e) => setSize(e.target.value)} className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.size ? "border-red-500" : "border-gray-300"}`} placeholder="e.g. 4ft x 6ft" />
                    {errors.size && <p className="mt-1 text-sm text-red-500">{errors.size}</p>}
                  </div>
                )}

                {adType === "LED" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Video Length (seconds) <span className="text-red-500">*</span></label>
                    <input type="text" value={videoLength} onChange={(e) => setVideoLength(e.target.value)} className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.videoLength ? "border-red-500" : "border-gray-300"}`} placeholder="e.g. 30 seconds" />
                    {errors.videoLength && <p className="mt-1 text-sm text-red-500">{errors.videoLength}</p>}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                  <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" min="1" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Total Amount (₹) <span className="text-red-500">*</span></label>
                  <input type="number" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.totalAmount ? "border-red-500" : "border-gray-300"}`} step="0.01" min="0" required />
                  {errors.totalAmount && <p className="mt-1 text-sm text-red-500">{errors.totalAmount}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Paid Amount (₹) <span className="text-red-500">*</span></label>
                  <input type="number" value={paidAmount} onChange={(e) => { setPaidAmount(e.target.value); setErrors({ ...errors, paidAmount: "" }); }} className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.paidAmount ? "border-red-500" : "border-gray-300"}`} step="0.01" min="0" required />
                  {errors.paidAmount && <p className="mt-1 text-sm text-red-500">{errors.paidAmount}</p>}
                </div>

                {(() => {
                  const p = parseFloat(paidAmount) || 0;
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

                {(parseFloat(paidAmount) || 0) > 0 && (
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
                      {errors.modeOfPayment && <p className="mt-1 text-sm text-red-500">{errors.modeOfPayment}</p>}
                    </div>

                    {requiresReferenceNumber(modeOfPayment) && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{modeOfPayment === "Cheque" ? "Cheque" : "Reference"} Number <span className="text-red-500">*</span></label>
                        <input type="text" value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.chequeNumber ? "border-red-500" : "border-gray-300"}`} required />
                        {errors.chequeNumber && <p className="mt-1 text-sm text-red-500">{errors.chequeNumber}</p>}
                      </div>
                    )}
                  </>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Input By</label>
                  <input type="text" value={inputBy} onChange={(e) => setInputBy(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="flex gap-3">
                  <button type="submit" disabled={saving} className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium disabled:opacity-50">
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                  <button type="button" onClick={() => { setIsEditing(false); if (ad) { setDate(ad.date || ""); setName(ad.name || ""); setPanNumber(ad.panNumber || ""); setMobileNumber(ad.mobileNumber || ""); setAdType(ad.adType || ""); setSize(ad.size || ""); setVideoLength(ad.videoLength || ""); setQuantity(ad.quantity?.toString() || "1"); setTotalAmount(ad.totalAmount?.toString() || ""); setPaidAmount(ad.paidAmount?.toString() || ""); setModeOfPayment((ad.modeOfPayment as PaymentMode) || ""); setChequeNumber(ad.chequeNumber || ""); setInputBy(ad.inputBy || ""); } }} className="flex-1 bg-gray-300 text-gray-700 py-3 px-4 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 font-medium">
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
                  <h2 className="text-2xl font-bold">{ad.name}</h2>
                  <p className="text-teal-100 mt-1">
                    {ad.date ? new Date(ad.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : '-'}
                  </p>
                </div>

                <div className="p-6 space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">Advertisement Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-500">Name</p>
                        <p className="text-base font-medium text-gray-900">{ad.name}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Ad Type</p>
                        <p className="text-base font-medium text-gray-900">
                          <span className={`inline-flex px-2 py-0.5 rounded text-sm font-medium ${ad.adType === 'Banner' ? 'bg-purple-100 text-purple-800' : 'bg-yellow-100 text-yellow-800'}`}>
                            {ad.adType || '-'}
                          </span>
                        </p>
                      </div>
                      {ad.adType === 'Banner' && (
                        <div>
                          <p className="text-sm text-gray-500">Size</p>
                          <p className="text-base font-medium text-gray-900">{ad.size || '-'}</p>
                        </div>
                      )}
                      {ad.adType === 'LED' && (
                        <div>
                          <p className="text-sm text-gray-500">Video Length</p>
                          <p className="text-base font-medium text-gray-900">{ad.videoLength || '-'}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-sm text-gray-500">Quantity</p>
                        <p className="text-base font-medium text-gray-900">{ad.quantity ?? 1}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Mobile Number</p>
                        <p className="text-base font-medium text-gray-900">{ad.mobileNumber || '-'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">PAN Number</p>
                        <p className="text-base font-medium text-gray-900">{ad.panNumber || '-'}</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">Payment Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-gray-50 p-3 rounded">
                        <p className="text-sm text-gray-500">Total Amount</p>
                        <p className="text-xl font-bold text-gray-900">
                          ₹ {(ad.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div className="bg-green-50 p-3 rounded">
                        <p className="text-sm text-gray-500">Paid Amount</p>
                        <p className="text-xl font-bold text-green-600">
                          ₹ {(ad.paidAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div className={`p-3 rounded ${(ad.pendingAmount || 0) > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                        <p className="text-sm text-gray-500">Pending Amount</p>
                        <p className={`text-xl font-bold ${(ad.pendingAmount || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          ₹ {(ad.pendingAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      {ad.modeOfPayment && (
                        <div>
                          <p className="text-sm text-gray-500">Mode of Payment</p>
                          <p className="text-base font-medium text-gray-900">{ad.modeOfPayment}</p>
                        </div>
                      )}
                      {ad.chequeNumber && (
                        <div>
                          <p className="text-sm text-gray-500">{ad.modeOfPayment === 'Cheque' ? 'Cheque' : 'Reference'} Number</p>
                          <p className="text-base font-medium text-gray-900">{ad.chequeNumber}</p>
                        </div>
                      )}
                      {ad.receiptNumber && (
                        <div>
                          <p className="text-sm text-gray-500">Receipt Number</p>
                          <p className="text-base font-medium text-gray-900">{ad.receiptNumber}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">Record Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-500">Input By</p>
                        <p className="text-base font-medium text-gray-900">{ad.inputBy || '-'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Created At</p>
                        <p className="text-base font-medium text-gray-900">{ad.createdAt ? new Date(ad.createdAt).toLocaleString('en-IN') : '-'}</p>
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
                <p className="text-gray-600 mb-2">Are you sure you want to delete this advertisement booking?</p>
                <p className="text-sm text-red-600 mb-6">
                  Name: <strong>{ad.name}</strong> — Total: ₹ {(ad.totalAmount || 0).toLocaleString('en-IN')}
                  <br />
                  {ad.incomeKey && "Linked income record and total income will also be adjusted. "}
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