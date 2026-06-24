"use client";
import { useAuth } from "../../context/AuthContext";
import ProtectedRoute from "../../components/ProtectedRoute";
import { useEffect, useState } from "react";
import { getUserDoc } from "../../utils/getUserDoc";
import { useRouter } from "next/navigation";
import { db } from "../../firebase/config";
import { ref, get, set, update, push } from "firebase/database";
import { generateReceiptPDF } from "../../utils/generateReceiptPDF";
import { logAudit } from "../../utils/auditLog";
import { dbPath, getCurrentYearString, getCurrentYearShort, DEFAULTS ,DB_PATHS} from "../../utils/constants";
import { useFinancialYear } from "../../context/FinancialYearContext";

type ModeOfPayment = "Cash" | "Cheque" | "NEFT";

export default function AddMemberPage() {
  const { user } = useAuth();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const { selectedYear } = useFinancialYear();
  const router = useRouter();

  // Form state
  const [date, setDate] = useState("");
  const [memberId, setmemberId] = useState("");
  const [name, setName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [secondaryMemberName, setSecondaryMemberName] = useState("");
  const [address, setAddress] = useState("");
  const [emailId, setEmailId] = useState("");
  const [modeOfPayment, setModeOfPayment] = useState<ModeOfPayment | "">("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [inputBy, setInputBy] = useState("");
  const [paymentStatus, setPaymentStatus] = useState(false);
  const [amount, setAmount] =useState<string>(DEFAULTS.MEMBER_AMOUNT);
  const [receiptNumber, setReceiptNumber] = useState("");

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (user) {
      getUserDoc(user.uid)
        .then((data) => {
          setUserData(data);
          if (data && data.name) {
            setUserName(data.name);
            setInputBy(data.name);
          }
        })
        .finally(() => setLoading(false));
    }
  }, [user]);

  // Set current date as default and generate member id
  useEffect(() => {
    const today = new Date();
    const formattedDate = today.toISOString().split("T")[0];
    setDate(formattedDate);
    
    // Generate member id
    generatememberId();
  }, []);

  const generatememberId = async () => {
    try {
      // Get current year in YY format
      const currentYear = new Date().getFullYear().toString().slice(-2);
      
      // Reference to the receipt counter in Firebase
      
      const memberCounterRef = ref(db, `${DB_PATHS.ROOT}/${DB_PATHS.MEMBER_COUNTER}`);
      const snapshot = await get(memberCounterRef);
      
      let nextNumber = 1;
      if (snapshot.exists()) {
        nextNumber = snapshot.val() + 1;
      }
      
      // Format: ABS/YY/number
      const newMemberNumber = `ABSPM-${nextNumber}`;
      setmemberId(newMemberNumber);
    } catch (error) {
      console.error("Error generating Member number:", error);
      // Fallback to a basic format if there's an error
      const currentYear = new Date().getFullYear().toString().slice(-2);
      setmemberId(`ABSPM-1`);
    }
  };

  const generateReceiptNumber = async () => {
    try {
      const currentYear = new Date().getFullYear().toString().slice(-2);
      const receiptCounterRef = ref(db, `${DB_PATHS.ROOT}/${DB_PATHS.RECEIPT_COUNTERS}/${currentYear}`);
      const snapshot = await get(receiptCounterRef);
      
      let nextNumber = 1;
      if (snapshot.exists()) {
        nextNumber = snapshot.val() + 1;
      }
      
      const newReceiptNumber = `ABS/${currentYear}/${nextNumber}`;
      setReceiptNumber(newReceiptNumber);
    } catch (error) {
      console.error("Error generating receipt number:", error);
      const currentYear = new Date().getFullYear().toString().slice(-2);
      setReceiptNumber(`ABS/${currentYear}/1`);
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = "Name is mandatory";
    }

    if (!panNumber.trim()) {
      newErrors.panNumber = "PAN Number is mandatory";
    }

    if (!address.trim()) {
      newErrors.address = "Address is mandatory";
    }

    if (!emailId.trim()) {
      newErrors.emailId = "Email ID is mandatory";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailId)) {
      newErrors.emailId = "Please enter a valid email address";
    }

    if (paymentStatus && !modeOfPayment) {
      newErrors.modeOfPayment = "Please select a mode of payment";
    }

    if (paymentStatus && (modeOfPayment === "Cheque" || modeOfPayment === "NEFT") && !chequeNumber.trim()) {
      newErrors.chequeNumber = "Cheque Number is mandatory for " + modeOfPayment;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (validateForm()) {
      try {
        const currentYear = getCurrentYearString();
        const incomeAmount = parseFloat(amount) || 0;

        const memberData: Record<string, any> = {
          date,
          memberId,
          name,
          mobileNumber: mobileNumber || null,
          panNumber,
          secondaryMemberName: secondaryMemberName || null,
          address,
          emailId,
          paymentStatus,
          inputBy,
          createdAt: new Date().toISOString(),
          createdBy: user?.uid,
        };

        if (paymentStatus) {
          memberData.modeOfPayment = modeOfPayment;
          memberData.amount = amount.trim() ? parseFloat(amount) : 0;
          memberData.chequeNumber = modeOfPayment === "Cheque" || modeOfPayment === "NEFT" ? chequeNumber : null;
        }

        // Save to Firebase with a unique key
        const newMemberRef = push(ref(db, dbPath.members(currentYear)));
        const newMemberKey = newMemberRef.key;
        memberData.key = newMemberKey;
        await set(newMemberRef, memberData);

        // Update the member counter
        const memberCounterRef = ref(db,  dbPath.memberCounter);
        const counterSnapshot = await get(memberCounterRef);
        
        if (counterSnapshot.exists()) {
          await set(memberCounterRef, counterSnapshot.val() + 1);
        } else {
          await set(memberCounterRef, 1);
        }

          // If payment is received, also record income, update total, generate receipt
          if (paymentStatus) {
            // Generate receipt number first
            const receiptYear = new Date().getFullYear().toString().slice(-2);
            const receiptCounterRef = ref(db, `${DB_PATHS.ROOT}/${DB_PATHS.RECEIPT_COUNTERS}/${receiptYear}`);
            const receiptSnap = await get(receiptCounterRef);
            let nextReceiptNum = 1;
            if (receiptSnap.exists()) {
              nextReceiptNum = receiptSnap.val() + 1;
            }
            const newReceiptNumber = `ABS/${receiptYear}/${nextReceiptNum}`;

            // Create income record
            const newIncomeRef = push(ref(db, dbPath.income(currentYear)));
            const incomeKey = newIncomeRef.key;

            const incomeData = {
              key: incomeKey,
              date,
              receiptNumber: newReceiptNumber,
              name,
              mobileNumber: mobileNumber || null,
              panNumber,
              amount: incomeAmount,
              category: DEFAULTS.MEMBERSHIP_INCOME_CATEGORY,
              modeOfPayment,
              chequeNumber: modeOfPayment === "Cheque" || modeOfPayment === "NEFT" ? chequeNumber : null,
              inputBy,
              createdAt: new Date().toISOString(),
              createdBy: user?.uid,
              memberLink: newMemberKey,
            };

            await set(newIncomeRef, incomeData);

            // Store incomeKey and receiptNumber on the member record
            memberData.incomeKey = incomeKey;
            memberData.receiptNumber = newReceiptNumber;
            await update(newMemberRef, {
              incomeKey: incomeKey,
              receiptNumber: newReceiptNumber,
            });

            // Update total income
            const totalIncomeRef = ref(db, dbPath.totalIncome(currentYear));
            const totalSnapshot = await get(totalIncomeRef);
            if (totalSnapshot.exists()) {
              await set(totalIncomeRef, totalSnapshot.val() + incomeAmount);
            } else {
              await set(totalIncomeRef, incomeAmount);
            }

            // Update receipt counter
            await set(receiptCounterRef, nextReceiptNum);

            // Generate and download receipt PDF
            generateReceiptPDF(incomeData);

            console.log("Income Data from member payment:", incomeData);
          }

        // Log audit for member creation
        await logAudit({
          action: "CREATE",
          entityType: "Member",
          entityId: newMemberKey as string,
          previousData: null,
          newData: memberData,
          changedBy: userData?.name || user?.email || "Unknown",
          changedByUid: user?.uid || "",
          changedAt: new Date().toISOString(),
        });

        console.log("Member Data:", memberData);
        alert("Member added successfully!");

        // Reset form and generate new member ID
        setName("");
        setMobileNumber("");
        setPanNumber("");
        setSecondaryMemberName("");
        setAddress("");
        setEmailId("");
        setModeOfPayment("");
        setChequeNumber("");
        setPaymentStatus(false);
        setAmount("8000");
        setReceiptNumber("");
        setErrors({});
        
        // Generate new member ID for the next entry
        generatememberId();
        
      } catch (error) {
        console.error("Error saving member:", error);
        alert("Error saving member. Please try again.");
      }
    }
  };

  const showChequeField = modeOfPayment === "Cheque" || modeOfPayment === "NEFT";

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div>Loading...</div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center mb-6">
            <button
              onClick={() => router.push("/dashboard")}
              className="mr-4 text-blue-600 hover:text-blue-800"
            >
              ← Back to Dashboard
            </button>
            <h1 className="text-3xl font-bold">Add Member</h1>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Receipt Number - Auto generated */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Member ID
                </label>
                <input
                  type="text"
                  value={memberId}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-600"
                />
                <p className="mt-1 text-xs text-gray-500">Auto-generated unique member ID</p>
              </div>

              {/* Name - Mandatory */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.name ? "border-red-500" : "border-gray-300"
                  }`}
                  placeholder="Enter member name"
                />
                {errors.name && (
                  <p className="mt-1 text-sm text-red-500">{errors.name}</p>
                )}
              </div>

              {/* Mobile Number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mobile Number
                </label>
                <input
                  type="tel"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  value={panNumber}
                  onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.panNumber ? "border-red-500" : "border-gray-300"
                  }`}
                  placeholder="Enter PAN number"
                  maxLength={10}
                />
                {errors.panNumber && (
                  <p className="mt-1 text-sm text-red-500">{errors.panNumber}</p>
                )}
              </div>

              {/* Secondary Member Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Secondary Member Name
                </label>
                <input
                  type="text"
                  value={secondaryMemberName}
                  onChange={(e) => setSecondaryMemberName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter secondary member name (if any)"
                />
              </div>

              {/* Address - Mandatory */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Address <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.address ? "border-red-500" : "border-gray-300"
                  }`}
                  placeholder="Enter address"
                  rows={3}
                />
                {errors.address && (
                  <p className="mt-1 text-sm text-red-500">{errors.address}</p>
                )}
              </div>

              {/* Email ID - Mandatory */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={emailId}
                  onChange={(e) => setEmailId(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.emailId ? "border-red-500" : "border-gray-300"
                  }`}
                  placeholder="Enter email address"
                />
                {errors.emailId && (
                  <p className="mt-1 text-sm text-red-500">{errors.emailId}</p>
                )}
              </div>

              {/* Payment Status - Checkbox */}
              <div className="flex items-start">
                <div className="flex items-center h-5">
                  <input
                    type="checkbox"
                    id="paymentStatus"
                    checked={paymentStatus}
                    onChange={(e) => {
                      setPaymentStatus(e.target.checked);
                      if (!e.target.checked) {
                        setModeOfPayment("");
                        setChequeNumber("");
                        setAmount("8000");
                        setErrors({ ...errors, modeOfPayment: "", chequeNumber: "" });
                      }
                    }}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                </div>
                <label htmlFor="paymentStatus" className="ml-2 block text-sm font-medium text-gray-700">
                  Payment Received
                </label>
              </div>

              {/* Payment Details - Only visible when payment status is checked */}
              {paymentStatus && (
                <>
                  {/* Mode of Payment - Mandatory */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Mode of Payment <span className="text-red-500">*</span>
                    </label>
                    <div className="flex space-x-6">
                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="modeOfPayment"
                          value="Cash"
                          checked={modeOfPayment === "Cash"}
                          onChange={(e) => {
                            setModeOfPayment(e.target.value as ModeOfPayment);
                            setErrors({ ...errors, modeOfPayment: "" });
                          }}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="ml-2 text-gray-700">Cash</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="modeOfPayment"
                          value="Cheque"
                          checked={modeOfPayment === "Cheque"}
                          onChange={(e) => {
                            setModeOfPayment(e.target.value as ModeOfPayment);
                            setErrors({ ...errors, modeOfPayment: "" });
                          }}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="ml-2 text-gray-700">Cheque</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="modeOfPayment"
                          value="NEFT"
                          checked={modeOfPayment === "NEFT"}
                          onChange={(e) => {
                            setModeOfPayment(e.target.value as ModeOfPayment);
                            setErrors({ ...errors, modeOfPayment: "" });
                          }}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="ml-2 text-gray-700">NEFT</span>
                      </label>
                    </div>
                    {errors.modeOfPayment && (
                      <p className="mt-1 text-sm text-red-500">{errors.modeOfPayment}</p>
                    )}
                  </div>

                  {/* Amount - Default 8000, editable */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Amount (₹)
                    </label>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Cheque Number - Conditionally visible and mandatory */}
                  {showChequeField && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Cheque/Reference Number <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={chequeNumber}
                        onChange={(e) => setChequeNumber(e.target.value)}
                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          errors.chequeNumber ? "border-red-500" : "border-gray-300"
                        }`}
                        placeholder={`Enter ${modeOfPayment === "Cheque" ? "cheque" : "reference"} number`}
                      />
                      {errors.chequeNumber && (
                        <p className="mt-1 text-sm text-red-500">{errors.chequeNumber}</p>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Input By */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Input By
                </label>
                <input
                  type="text"
                  value={inputBy}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-600"
                />
              </div>

              {/* Submit Button */}
              <div>
                <button
                  type="submit"
                  className="w-full bg-indigo-600 text-white py-3 px-4 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                >
                  Add Member
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}