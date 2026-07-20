"use client";
import { useAuth } from "../../../context/AuthContext";
import ProtectedRoute from "../../../components/ProtectedRoute";
import { useEffect, useState } from "react";
import { getUserDoc } from "../../../utils/getUserDoc";
import { useRouter, useParams } from "next/navigation";
import { db } from "../../../firebase/config";
import { ref, get, set, update, remove, push } from "firebase/database";
import { logAudit } from "../../../utils/auditLog";
import { generateReceiptPDF } from "../../../utils/generateReceiptPDF";
import { dbPath, getCurrentYearString, getCurrentYearShort, DEFAULTS } from "../../../utils/constants";
import { useFinancialYear } from "../../../context/FinancialYearContext";

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
  amount?: string | number;
  chequeNumber?: string | null;
  referredBy?: string | null;
  inputBy?: string;
  createdBy?: string;
  createdAt?: string;
  incomeKey?: string | null;
  receiptNumber?: string | null;
  registrationFee?: boolean;
  registrationFeeAmount?: number;
  membershipAmount?: number;
}

export default function MemberDetailPage() {
  const { user } = useAuth();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [member, setMember] = useState<MemberItem | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPaymentConfirm, setShowPaymentConfirm] = useState(false);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [paymentModeOfPayment, setPaymentModeOfPayment] = useState("Cash");
  const [paymentChequeNumber, setPaymentChequeNumber] = useState("");
  const { selectedYear } = useFinancialYear();

  const router = useRouter();
  const params = useParams();

  // Edit form state
  const [date, setDate] = useState("");
  const [memberId, setMemberId] = useState("");
  const [name, setName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [secondaryMemberName, setSecondaryMemberName] = useState("");
  const [address, setAddress] = useState("");
  const [emailId, setEmailId] = useState("");
  const [paymentStatus, setPaymentStatus] = useState(false);
  const [amount, setAmount] = useState("");
  const [modeOfPayment, setModeOfPayment] = useState("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [editReferredBy, setEditReferredBy] = useState("");
  const [inputBy, setInputBy] = useState("");

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
      fetchMemberDetail();
    }
  }, [userData, params.id]);

  const fetchMemberDetail = async () => {
    try {
      setLoading(true);
      const currentYear = selectedYear;
      const memberRef = ref(db, `${dbPath.members(currentYear)}/${params.id}`);
      const snapshot = await get(memberRef);

      if (snapshot.exists()) {
        const data = snapshot.val();
        const memberItem: MemberItem = {
          key: params.id as string,
          ...data,
        };
        setMember(memberItem);
        // Populate edit form
        setDate(memberItem.date || "");
        setMemberId(memberItem.memberId || "");
        setName(memberItem.name || "");
        setMobileNumber(memberItem.mobileNumber || "");
        setPanNumber(memberItem.panNumber || "");
        setSecondaryMemberName(memberItem.secondaryMemberName || "");
        setAddress(memberItem.address || "");
        setEmailId(memberItem.emailId || "");
        setPaymentStatus(memberItem.paymentStatus || false);
        setAmount(memberItem.amount?.toString() || "");
        setModeOfPayment(memberItem.modeOfPayment || "");
        setChequeNumber(memberItem.chequeNumber || "");
        setEditReferredBy(memberItem.referredBy || "");
        setInputBy(memberItem.inputBy || "");
      } else {
        setMember(null);
      }
    } catch (error) {
      console.error("Error fetching member:", error);
      setMember(null);
    } finally {
      setLoading(false);
    }
  };

  const generateReceiptNumber = async (year: string) => {
    const yearShort = year.slice(-2);
    const receiptCounterRef = ref(db, dbPath.receiptCounter(yearShort));
    const snapshot = await get(receiptCounterRef);
    let nextNumber = 1;
    if (snapshot.exists()) {
      nextNumber = snapshot.val() + 1;
    }
    return `ABS/${yearShort}/${nextNumber}`;
  };

  const updateReceiptCounter = async (year: string) => {
    const yearShort = year.slice(-2);
    const receiptCounterRef = ref(db, dbPath.receiptCounter(yearShort));
    const snapshot = await get(receiptCounterRef);
    if (snapshot.exists()) {
      await set(receiptCounterRef, snapshot.val() + 1);
    } else {
      await set(receiptCounterRef, 1);
    }
  };

  const createIncomeRecord = async (
    memberData: MemberItem,
    year: string,
    receiptNum: string,
    changedBy: string,
    changedByUid: string
  ) => {
    const incomeAmount = parseFloat(memberData.amount?.toString() || "0");
    if (incomeAmount <= 0) {
      throw new Error("Amount must be greater than 0 to create an income record.");
    }

    const newIncomeRef = push(ref(db, dbPath.income(year)));
    const incomeKey = newIncomeRef.key;

    const membershipAmount = DEFAULTS.MEMBER_AMOUNT;
    const registrationFeeAmount = memberData.registrationFee ? (memberData.registrationFeeAmount || DEFAULTS.REGISTRATION_FEE) : 0;

    const incomeData = {
      key: incomeKey,
      date: memberData.date || new Date().toISOString().split("T")[0],
      receiptNumber: receiptNum,
      name: memberData.name,
      mobileNumber: memberData.mobileNumber || null,
      panNumber: memberData.panNumber || "",
      amount: incomeAmount,
      category: DEFAULTS.MEMBERSHIP_INCOME_CATEGORY,
      modeOfPayment: memberData.modeOfPayment || "Cash",
      chequeNumber: memberData.chequeNumber || null,
      inputBy: memberData.inputBy || changedBy,
      createdAt: new Date().toISOString(),
      createdBy: changedByUid,
      memberLink: memberData.key,
      registrationFee: memberData.registrationFee || false,
      registrationFeeAmount: registrationFeeAmount,
      membershipAmount: membershipAmount,
    };

    await set(newIncomeRef, incomeData);

    // Update total income
    const totalIncomeRef = ref(db, dbPath.totalIncome(year));
    const totalSnapshot = await get(totalIncomeRef);
    if (totalSnapshot.exists()) {
      await set(totalIncomeRef, totalSnapshot.val() + incomeAmount);
    } else {
      await set(totalIncomeRef, incomeAmount);
    }

    // Log audit for income creation
    await logAudit({
      action: "CREATE",
      entityType: "Income",
      entityId: incomeKey as string,
      previousData: null,
      newData: incomeData,
      changedBy: changedBy,
      changedByUid: changedByUid,
      changedAt: new Date().toISOString(),
    });

    return incomeKey;
  };

  const deleteIncomeRecord = async (
    incomeKey: string,
    year: string,
    changedBy: string,
    changedByUid: string
  ) => {
    const incomeRef = ref(db, `${dbPath.income(year)}/${incomeKey}`);
    const incomeSnapshot = await get(incomeRef);

    if (!incomeSnapshot.exists()) {
      console.warn("Linked income record not found for deletion:", incomeKey);
      return;
    }

    const incomeData = incomeSnapshot.val();
    const incomeAmount = incomeData.amount || 0;

    // Remove the income record
    await remove(incomeRef);

    // Update total income
    const totalIncomeRef = ref(db, dbPath.totalIncome(year));
    const totalSnapshot = await get(totalIncomeRef);
    if (totalSnapshot.exists()) {
      await set(totalIncomeRef, totalSnapshot.val() - incomeAmount);
    }

    // Log audit for income deletion
    await logAudit({
      action: "DELETE",
      entityType: "Income",
      entityId: incomeKey,
      previousData: incomeData,
      newData: null,
      changedBy: changedBy,
      changedByUid: changedByUid,
      changedAt: new Date().toISOString(),
    });
  };

  const handleUpdatePaymentStatus = async () => {
    if (!member || !userData || !user) return;
    try {
      setPaymentProcessing(true);
      const currentYear = getCurrentYearString();
      const memberRef = ref(db, `${dbPath.members(currentYear)}/${params.id}`);

      // Get old data for audit
      const oldData = { ...member };

      // Determine registration fee from member or default
      const hasRegistrationFee = member.registrationFee !== undefined ? member.registrationFee : false;
      const regFeeAmount = hasRegistrationFee ? (member.registrationFeeAmount || DEFAULTS.REGISTRATION_FEE) : 0;
      const totalAmount = DEFAULTS.MEMBER_AMOUNT + regFeeAmount;

      // Generate receipt number
      const receiptNum = await generateReceiptNumber(currentYear);

      // Create income record with total amount (membership + registration fee)
      const incomeKey = await createIncomeRecord(
        {
          ...member,
          date: new Date().toISOString().split("T")[0],
          name: member.name,
          panNumber: member.panNumber || "",
          mobileNumber: member.mobileNumber || null,
          modeOfPayment: paymentModeOfPayment,
          amount: totalAmount,
          chequeNumber: paymentModeOfPayment === "Cash" ? null : (paymentChequeNumber.trim() || null),
          inputBy: userData.name || member.inputBy,
          registrationFee: hasRegistrationFee,
          registrationFeeAmount: regFeeAmount,
        },
        currentYear,
        receiptNum,
        userData.name || user.email || "Unknown",
        user.uid
      );

      // Update receipt counter
      await updateReceiptCounter(currentYear);

      // Update member record
      const updatedData: any = {
        ...member,
        paymentStatus: true,
        amount: totalAmount,
        receiptNumber: receiptNum,
        incomeKey: incomeKey as string,
        modeOfPayment: paymentModeOfPayment,
        chequeNumber: paymentModeOfPayment === "Cash" ? null : (paymentChequeNumber.trim() || null),
        registrationFee: hasRegistrationFee,
        registrationFeeAmount: regFeeAmount,
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid,
      };

      // Remove key from data since it's the DB key
      delete updatedData.key;

      await update(memberRef, updatedData);

      // Log audit
      await logAudit({
        action: "UPDATE",
        entityType: "Member",
        entityId: params.id as string,
        previousData: oldData,
        newData: { ...oldData, paymentStatus: true, amount: totalAmount, receiptNumber: receiptNum, incomeKey: incomeKey as string, modeOfPayment: paymentModeOfPayment, chequeNumber: paymentModeOfPayment === "Cash" ? null : (paymentChequeNumber.trim() || null), registrationFee: hasRegistrationFee, registrationFeeAmount: regFeeAmount },
        changedBy: userData.name || user.email || "Unknown",
        changedByUid: user.uid,
        changedAt: new Date().toISOString(),
      });

      // Generate receipt PDF
      generateReceiptPDF({
        date: new Date().toISOString().split("T")[0],
        receiptNumber: receiptNum,
        name: member.name,
        mobileNumber: member.mobileNumber || null,
        panNumber: member.panNumber || "",
        amount: totalAmount,
        category: DEFAULTS.MEMBERSHIP_INCOME_CATEGORY,
        modeOfPayment: paymentModeOfPayment,
        chequeNumber: paymentModeOfPayment === "Cash" ? null : (paymentChequeNumber.trim() || null),
        inputBy: userData.name || member.inputBy,
        createdBy: user.uid,
        createdAt: new Date().toISOString(),
        registrationFee: hasRegistrationFee,
        registrationFeeAmount: regFeeAmount,
        membershipAmount: DEFAULTS.MEMBER_AMOUNT,
      });

      alert(`Payment marked as Paid. Income record created and receipt generated.\nReceipt Number: ${receiptNum}`);
      setShowPaymentConfirm(false);
      fetchMemberDetail();
    } catch (error) {
      console.error("Error updating payment status:", error);
      alert("Error updating payment status. Please try again.");
    } finally {
      setPaymentProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (!member || !userData || !user) return;
    try {
      setSaving(true);
      const currentYear = getCurrentYearString();
      const memberRef = ref(db, `${dbPath.members(currentYear)}/${params.id}`);

      // Get old data for audit
      const oldData = { ...member };

      // If the member had a linked income record, delete it as well
      if (member.incomeKey) {
        await deleteIncomeRecord(
          member.incomeKey,
          currentYear,
          userData.name || user.email || "Unknown",
          user.uid
        );
      }

      // Remove the member record
      await remove(memberRef);

      // Log audit for member deletion
      await logAudit({
        action: "DELETE",
        entityType: "Member",
        entityId: params.id as string,
        previousData: oldData,
        newData: null,
        changedBy: userData.name || user.email || "Unknown",
        changedByUid: user.uid,
        changedAt: new Date().toISOString(),
      });

      alert("Member record deleted successfully!");
      router.push("/member-list");
    } catch (error) {
      console.error("Error deleting member:", error);
      alert("Error deleting member. Please try again.");
    } finally {
      setSaving(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!member || !userData || !user) return;

    if (!name.trim()) {
      alert("Name is required.");
      return;
    }

    try {
      setSaving(true);
      const currentYear = getCurrentYearString();
      const memberRef = ref(db, `${dbPath.members(currentYear)}/${params.id}`);

      // Get old data for audit
      const oldData = { ...member };

      // Detect payment status change
      const paymentStatusChanged = paymentStatus !== member.paymentStatus;
      let newIncomeKey = member.incomeKey;
      let newReceiptNumber = member.receiptNumber;

      if (paymentStatusChanged) {
        if (paymentStatus === true) {
          // Payment was changed from false → true: Create income record
          if (!amount || parseFloat(amount) <= 0) {
            alert("Amount is required to enable payment and create an income record.");
            setSaving(false);
            return;
          }

          // Generate receipt number
          const receiptNum = await generateReceiptNumber(currentYear);
          newReceiptNumber = receiptNum;

          // Create income record
          const incomeKey = await createIncomeRecord(
            {
              ...member,
              date,
              name: name.trim(),
              panNumber: panNumber || undefined,
              mobileNumber: mobileNumber || null,
              modeOfPayment,
              amount: parseFloat(amount) || 0,
              chequeNumber: chequeNumber || null,
              inputBy: inputBy || userData.name,
            },
            currentYear,
            receiptNum,
            userData.name || user.email || "Unknown",
            user.uid
          );

          newIncomeKey = incomeKey as string;

          // Update receipt counter
          await updateReceiptCounter(currentYear);

          // Determine registration fee from member or default
          const hasRegistrationFee = member.registrationFee !== undefined ? member.registrationFee : false;
          const regFeeAmount = hasRegistrationFee ? (member.registrationFeeAmount || DEFAULTS.REGISTRATION_FEE) : 0;

          // Generate receipt PDF
          generateReceiptPDF({
            date,
            receiptNumber: receiptNum,
            name: name.trim(),
            mobileNumber: mobileNumber || null,
            panNumber: panNumber || "",
            amount: parseFloat(amount),
            category: DEFAULTS.MEMBERSHIP_INCOME_CATEGORY,
            modeOfPayment: modeOfPayment || "Cash",
            chequeNumber: chequeNumber || null,
            inputBy: inputBy || userData.name,
            createdBy: user.uid,
            createdAt: new Date().toISOString(),
            registrationFee: hasRegistrationFee,
            registrationFeeAmount: regFeeAmount,
            membershipAmount: DEFAULTS.MEMBER_AMOUNT,
          });
        } else {
          // Payment was changed from true → false: Delete linked income record
          if (member.incomeKey) {
            await deleteIncomeRecord(
              member.incomeKey,
              currentYear,
              userData.name || user.email || "Unknown",
              user.uid
            );
          }
          newIncomeKey = null;
          newReceiptNumber = null;
        }
      }

      const updatedData: any = {
        date,
        memberId,
        name: name.trim(),
        mobileNumber: mobileNumber || null,
        panNumber: panNumber || null,
        secondaryMemberName: secondaryMemberName || null,
        address: address || null,
        emailId: emailId || null,
        paymentStatus,
        amount: amount ? parseFloat(amount) : null,
        modeOfPayment: modeOfPayment || null,
        chequeNumber: chequeNumber || null,
        referredBy: editReferredBy.trim() || null,
        inputBy: inputBy || userData.name,
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid,
      };

      // Only include incomeKey and receiptNumber if they have values to avoid Firebase "undefined" errors
      if (newIncomeKey !== undefined) {
        updatedData.incomeKey = newIncomeKey;
      }
      if (newReceiptNumber !== undefined) {
        updatedData.receiptNumber = newReceiptNumber;
      }

      // Update member record
      await update(memberRef, updatedData);

      // Log audit
      await logAudit({
        action: "UPDATE",
        entityType: "Member",
        entityId: params.id as string,
        previousData: oldData,
        newData: { ...oldData, ...updatedData },
        changedBy: userData.name || user.email || "Unknown",
        changedByUid: user.uid,
        changedAt: new Date().toISOString(),
      });

      const successMsg = paymentStatusChanged
        ? paymentStatus
          ? "Payment marked as paid. Income record created and receipt generated."
          : "Payment marked as pending. Linked income record removed."
        : "Member record updated successfully!";

      alert(successMsg);
      setIsEditing(false);
      fetchMemberDetail();
    } catch (error) {
      console.error("Error updating member:", error);
      alert("Error updating member. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const canAccess = userData && 
    (userData.userType === "Accounts" || userData.userType === "GB" || userData.userType === "Front Office");

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

  if (!member) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 py-8 px-4">
          <div className="max-w-4xl mx-auto">
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-md">
              Member record not found.
            </div>
            <button
              onClick={() => router.push("/member-list")}
              className="mt-4 text-blue-600 hover:text-blue-800"
            >
              ← Back to Member List
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
              onClick={() => router.push("/member-list")}
              className="mr-4 text-blue-600 hover:text-blue-800"
            >
              ← Back to Member List
            </button>
            <h1 className="text-3xl font-bold">
              {isEditing ? "Edit Member" : "Member Details"}
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
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Member ID</label>
                  <input
                    type="text"
                    value={memberId}
                    onChange={(e) => setMemberId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">PAN Number</label>
                  <input
                    type="text"
                    value={panNumber}
                    onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    maxLength={10}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Secondary Member Name</label>
                  <input
                    type="text"
                    value={secondaryMemberName}
                    onChange={(e) => setSecondaryMemberName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                  <textarea
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Payment Status</label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={paymentStatus}
                      onChange={(e) => setPaymentStatus(e.target.checked)}
                      className="h-5 w-5 text-blue-600 focus:ring-blue-500 rounded"
                    />
                    <span className="text-gray-700">{paymentStatus ? "Paid" : "Pending"}</span>
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    step="0.01"
                    min="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mode of Payment</label>
                  <input
                    type="text"
                    value={modeOfPayment}
                    onChange={(e) => setModeOfPayment(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cheque/Reference Number</label>
                  <input
                    type="text"
                    value={chequeNumber}
                    onChange={(e) => setChequeNumber(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Referred By</label>
                  <input
                    type="text"
                    value={editReferredBy}
                    onChange={(e) => setEditReferredBy(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter referrer name (optional)"
                  />
                </div>

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
                      if (member) {
                        setDate(member.date || "");
                        setMemberId(member.memberId || "");
                        setName(member.name || "");
                        setMobileNumber(member.mobileNumber || "");
                        setPanNumber(member.panNumber || "");
                        setSecondaryMemberName(member.secondaryMemberName || "");
                        setAddress(member.address || "");
                        setEmailId(member.emailId || "");
                        setPaymentStatus(member.paymentStatus || false);
                        setAmount(member.amount?.toString() || "");
                        setModeOfPayment(member.modeOfPayment || "");
                        setChequeNumber(member.chequeNumber || "");
                        setInputBy(member.inputBy || "");
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
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit
                </button>
                {!member.paymentStatus && (
                  <button
                    onClick={() => {
                      setPaymentModeOfPayment("Cash");
                      setPaymentChequeNumber("");
                      setShowPaymentConfirm(true);
                    }}
                    className="flex items-center gap-2 bg-green-600 text-white px-5 py-2.5 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 font-medium"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Update Payment Status
                  </button>
                )}
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-2 bg-red-600 text-white px-5 py-2.5 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 font-medium"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete
                </button>
              </div>

              {/* Detail Card */}
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

                  {/* Payment Status */}
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
                            ₹ {Number(member.amount).toLocaleString('en-IN', {
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
                      {member.chequeNumber && (
                        <div>
                          <p className="text-sm text-gray-500">Cheque/Reference Number</p>
                          <p className="text-base font-medium text-gray-900">{member.chequeNumber}</p>
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
                        <p className="text-base font-medium text-gray-900">{member.inputBy || '-'}</p>
                      </div>
                      {member.referredBy && (
                        <div>
                          <p className="text-sm text-gray-500">Referred By</p>
                          <p className="text-base font-medium text-gray-900">{member.referredBy}</p>
                        </div>
                      )}
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
            </>
          )}

          {/* Payment Confirmation Modal */}
          {showPaymentConfirm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Confirm Payment</h2>
                <p className="text-gray-600 mb-2">
                  Mark this member as <strong>Paid</strong>?
                </p>
                <p className="text-sm text-gray-500 mb-4">
                  This will:
                  <br />• Set payment status to <strong>Paid</strong>
                  <br />• Create an income record (membership fee + registration fee if applicable)
                  <br />• Generate a receipt number and PDF
                  <br />• Link the income record to this member
                </p>
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mode of Payment</label>
                    <select
                      value={paymentModeOfPayment}
                      onChange={(e) => {
                        setPaymentModeOfPayment(e.target.value);
                        if (e.target.value === "Cash") {
                          setPaymentChequeNumber("");
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <option value="Cash">Cash</option>
                      <option value="Cheque">Cheque</option>
                      <option value="NEFT">NEFT</option>
                    </select>
                  </div>
                  {paymentModeOfPayment !== "Cash" && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Cheque/Reference Number <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={paymentChequeNumber}
                        onChange={(e) => setPaymentChequeNumber(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                        required={paymentModeOfPayment !== "Cash"}
                      />
                    </div>
                  )}
                </div>
                <p className="text-sm text-gray-500 mb-4">
                  Member: <strong>{member.name}</strong> (ID: {member.memberId})
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      if (paymentModeOfPayment !== "Cash" && !paymentChequeNumber.trim()) {
                        alert("Please enter the Cheque/Reference number.");
                        return;
                      }
                      handleUpdatePaymentStatus();
                    }}
                    disabled={paymentProcessing}
                    className="flex-1 bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 font-medium disabled:opacity-50"
                  >
                    {paymentProcessing ? "Processing..." : "Yes, Mark as Paid"}
                  </button>
                  <button
                    onClick={() => setShowPaymentConfirm(false)}
                    disabled={paymentProcessing}
                    className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Delete Confirmation Modal */}
          {showDeleteConfirm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Confirm Delete</h2>
                <p className="text-gray-600 mb-2">
                  Are you sure you want to delete this member record?
                </p>
                <p className="text-sm text-red-600 mb-6">
                  Name: <strong>{member.name}</strong> (ID: {member.memberId})
                  <br />
                  This action cannot be undone.
                  {member.incomeKey && (
                    <>
                      <br />
                      The linked income record will also be deleted.
                    </>
                  )}
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