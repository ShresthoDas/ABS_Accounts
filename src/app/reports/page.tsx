"use client";
import { useAuth } from "../../context/AuthContext";
import ProtectedRoute from "../../components/ProtectedRoute";
import { useEffect, useState } from "react";
import { getUserDoc } from "../../utils/getUserDoc";
import { useRouter } from "next/navigation";
import { db } from "../../firebase/config";
import { ref, get } from "firebase/database";
import { dbPath } from "../../utils/constants";
import { useFinancialYear } from "../../context/FinancialYearContext";
import * as XLSX from "xlsx";

interface IncomeItem {
  key: string;
  date: string;
  receiptNumber: string;
  name: string;
  mobileNumber: string;
  panNumber: string;
  amount: number;
  category: string;
  modeOfPayment: string;
  chequeNumber: string;
  inputBy: string;
  createdAt: string;
}

interface ExpenseItem {
  key: string;
  date: string;
  billNumber: string;
  category: string;
  name: string;
  panNumber: string;
  amount: number;
  modeOfPayment: string;
  chequeNumber: string;
  inputBy: string;
  createdAt: string;
}

interface MemberItem {
  key: string;
  memberId: string;
  name: string;
  mobileNumber: string;
  panNumber: string;
  secondaryMemberName: string;
  address: string;
  emailId: string;
  amount: number;
  paymentStatus: boolean;
  modeOfPayment: string;
  chequeNumber: string;
  date: string;
  receiptNumber: string;
  inputBy: string;
}

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
  [key: string]: any;
}

interface StallItem {
  key: string;
  date?: string;
  stallNumber?: number;
  name?: string;
  stallType?: string;
  quantity?: number;
  totalAmount?: number;
  paidAmount?: number;
  pendingAmount?: number;
  mobileNumber?: string;
  panNumber?: string;
  [key: string]: any;
}

interface AdItem {
  key: string;
  date?: string;
  name?: string;
  adType?: string;
  size?: string;
  videoLength?: string;
  quantity?: number;
  totalAmount?: number;
  paidAmount?: number;
  pendingAmount?: number;
  mobileNumber?: string;
  panNumber?: string;
  [key: string]: any;
}

export default function ReportsPage() {
  const { user } = useAuth();
  const { selectedYear } = useFinancialYear();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (user) {
      getUserDoc(user.uid)
        .then((data) => setUserData(data))
        .finally(() => setLoading(false));
    }
  }, [user]);

  const formatFinancialYear = (year: string): string => {
    return `${year} - ${parseInt(year) + 1}`;
  };

  // ==================== Income Report ====================
  const generateIncomeReport = async () => {
    setGenerating("income");
    try {
      const snapshot = await get(ref(db, dbPath.income(selectedYear)));
      const rows: any[][] = [];

      rows.push([
        "Date",
        "Receipt Number",
        "Name",
        "Mobile Number",
        "PAN Number",
        "Amount (₹)",
        "Category",
        "Mode of Payment",
        "Cheque/Reference Number",
        "Input By",
      ]);

      let totalAmount = 0;

      if (snapshot.exists()) {
        const data = snapshot.val();
        const items: IncomeItem[] = Object.keys(data).map((key) => ({
          key,
          ...data[key],
        }));

        items.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

        items.forEach((item) => {
          const amt = item.amount || 0;
          totalAmount += amt;
          rows.push([
            item.date || "",
            item.receiptNumber || "",
            item.name || "",
            item.mobileNumber || "",
            item.panNumber || "",
            amt,
            item.category || "",
            item.modeOfPayment || "",
            item.chequeNumber || "",
            item.inputBy || "",
          ]);
        });
      }

      rows.push([]);
      rows.push(["", "", "", "", "Total", totalAmount, "", "", "", ""]);

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);

      ws["!cols"] = [
        { wch: 12 }, { wch: 18 }, { wch: 25 }, { wch: 15 }, { wch: 15 },
        { wch: 15 }, { wch: 20 }, { wch: 18 }, { wch: 22 }, { wch: 15 },
      ];

      XLSX.utils.book_append_sheet(wb, ws, "Income Report");
      XLSX.writeFile(wb, `Income_Report_${selectedYear}.xlsx`);
    } catch (error) {
      console.error("Error generating income report:", error);
      alert("Error generating income report. Please try again.");
    } finally {
      setGenerating(null);
    }
  };

  // ==================== Expense Report ====================
  const generateExpenseReport = async () => {
    setGenerating("expense");
    try {
      const snapshot = await get(ref(db, dbPath.expense(selectedYear)));
      const rows: any[][] = [];

      rows.push([
        "Date",
        "Bill Number",
        "Category",
        "Name",
        "PAN Number",
        "Amount (₹)",
        "Mode of Payment",
        "Cheque/Reference Number",
        "Input By",
      ]);

      let totalAmount = 0;

      if (snapshot.exists()) {
        const data = snapshot.val();
        const items: ExpenseItem[] = Object.keys(data).map((key) => ({
          key,
          ...data[key],
        }));

        items.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

        items.forEach((item) => {
          const amt = item.amount || 0;
          totalAmount += amt;
          rows.push([
            item.date || "",
            item.billNumber || "",
            item.category || "",
            item.name || "",
            item.panNumber || "",
            amt,
            item.modeOfPayment || "",
            item.chequeNumber || "",
            item.inputBy || "",
          ]);
        });
      }

      rows.push([]);
      rows.push(["", "", "", "", "Total", totalAmount, "", "", ""]);

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);

      ws["!cols"] = [
        { wch: 12 }, { wch: 18 }, { wch: 25 }, { wch: 25 }, { wch: 15 },
        { wch: 15 }, { wch: 18 }, { wch: 22 }, { wch: 15 },
      ];

      XLSX.utils.book_append_sheet(wb, ws, "Expense Report");
      XLSX.writeFile(wb, `Expense_Report_${selectedYear}.xlsx`);
    } catch (error) {
      console.error("Error generating expense report:", error);
      alert("Error generating expense report. Please try again.");
    } finally {
      setGenerating(null);
    }
  };

  // ==================== Membership Paid Report ====================
  const generateMembershipPaidReport = async () => {
    setGenerating("paid");
    try {
      const snapshot = await get(ref(db, dbPath.members(selectedYear)));
      const rows: any[][] = [];

      rows.push([
        "Member ID",
        "Name",
        "Mobile Number",
        "PAN Number",
        "Secondary Member Name",
        "Address",
        "Email ID",
        "Amount (₹)",
        "Mode of Payment",
        "Cheque/Reference Number",
        "Receipt Number",
        "Date",
        "Input By",
      ]);

      let totalAmount = 0;

      if (snapshot.exists()) {
        const data = snapshot.val();
        const items: MemberItem[] = Object.keys(data)
          .map((key) => ({
            key,
            ...data[key],
          }))
          .filter((m) => m.paymentStatus === true);

        items.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

        items.forEach((item) => {
          const amt = item.amount || 0;
          totalAmount += amt;
          rows.push([
            item.memberId || "",
            item.name || "",
            item.mobileNumber || "",
            item.panNumber || "",
            item.secondaryMemberName || "",
            item.address || "",
            item.emailId || "",
            amt,
            item.modeOfPayment || "",
            item.chequeNumber || "",
            item.receiptNumber || "",
            item.date || "",
            item.inputBy || "",
          ]);
        });
      }

      rows.push([]);
      rows.push(["", "", "", "", "", "", "Total", totalAmount, "", "", "", "", ""]);

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);

      ws["!cols"] = [
        { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 25 },
        { wch: 30 }, { wch: 25 }, { wch: 15 }, { wch: 18 }, { wch: 22 },
        { wch: 18 }, { wch: 12 }, { wch: 15 },
      ];

      XLSX.utils.book_append_sheet(wb, ws, "Membership Paid Report");
      XLSX.writeFile(wb, `Membership_Paid_Report_${selectedYear}.xlsx`);
    } catch (error) {
      console.error("Error generating membership paid report:", error);
      alert("Error generating membership paid report. Please try again.");
    } finally {
      setGenerating(null);
    }
  };

  // ==================== Membership Unpaid Report ====================
  const generateMembershipUnpaidReport = async () => {
    setGenerating("unpaid");
    try {
      const snapshot = await get(ref(db, dbPath.members(selectedYear)));
      const rows: any[][] = [];

      rows.push([
        "Member ID",
        "Name",
        "Mobile Number",
        "PAN Number",
        "Secondary Member Name",
        "Address",
        "Email ID",
        "Amount (₹)",
        "Date",
      ]);

      let totalPending = 0;

      if (snapshot.exists()) {
        const data = snapshot.val();
        const items: MemberItem[] = Object.keys(data)
          .map((key) => ({
            key,
            ...data[key],
          }))
          .filter((m) => m.paymentStatus === false);

        items.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

        items.forEach((item) => {
          const amt = item.amount || 0;
          totalPending += amt;
          rows.push([
            item.memberId || "",
            item.name || "",
            item.mobileNumber || "",
            item.panNumber || "",
            item.secondaryMemberName || "",
            item.address || "",
            item.emailId || "",
            amt,
            item.date || "",
          ]);
        });
      }

      rows.push([]);
      rows.push(["", "", "", "", "", "", "Total", totalPending, ""]);

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);

      ws["!cols"] = [
        { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 25 },
        { wch: 30 }, { wch: 25 }, { wch: 15 }, { wch: 12 },
      ];

      XLSX.utils.book_append_sheet(wb, ws, "Membership Unpaid Report");
      XLSX.writeFile(wb, `Membership_Unpaid_Report_${selectedYear}.xlsx`);
    } catch (error) {
      console.error("Error generating membership unpaid report:", error);
      alert("Error generating membership unpaid report. Please try again.");
    } finally {
      setGenerating(null);
    }
  };

  // ==================== Donation Report ====================
  const generateDonationReport = async () => {
    setGenerating("donation");
    try {
      const snapshot = await get(ref(db, dbPath.donations(selectedYear)));
      const rows: any[][] = [];

      rows.push([
        "Date",
        "Donor Name",
        "Event Category",
        "Gotra",
        "Family Details",
        "Mobile Number",
        "PAN Number",
        "Total Amount (₹)",
        "Paid Amount (₹)",
        "Pending Amount (₹)",
      ]);

      let totalAmount = 0;
      let totalPaid = 0;
      let totalPending = 0;

      if (snapshot.exists()) {
        const data = snapshot.val();
        const items: DonationItem[] = Object.keys(data).map((key) => ({
          key,
          ...data[key],
        }));

        items.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

        items.forEach((item) => {
          const amt = item.amount || 0;
          const paid = item.paidAmount || 0;
          const pending = item.pendingAmount || 0;
          totalAmount += amt;
          totalPaid += paid;
          totalPending += pending;
          rows.push([
            item.date || "",
            item.donorName || "",
            item.eventCategory || "",
            item.gotra || "",
            item.familyDetails || "",
            item.mobileNumber || "",
            item.panNumber || "",
            amt,
            paid,
            pending,
          ]);
        });
      }

      rows.push([]);
      rows.push(["", "", "", "", "", "", "Total", totalAmount, totalPaid, totalPending]);

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);

      ws["!cols"] = [
        { wch: 12 }, { wch: 25 }, { wch: 25 }, { wch: 15 }, { wch: 25 },
        { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
      ];

      XLSX.utils.book_append_sheet(wb, ws, "Donation Report");
      XLSX.writeFile(wb, `Donation_Report_${selectedYear}.xlsx`);
    } catch (error) {
      console.error("Error generating donation report:", error);
      alert("Error generating donation report. Please try again.");
    } finally {
      setGenerating(null);
    }
  };

  // ==================== Stall Report ====================
  const generateStallReport = async () => {
    setGenerating("stall");
    try {
      const snapshot = await get(ref(db, dbPath.stalls(selectedYear)));
      const rows: any[][] = [];

      rows.push([
        "Date",
        "Stall Number",
        "Name",
        "Stall Type",
        "Quantity",
        "Total Amount (₹)",
        "Paid Amount (₹)",
        "Pending Amount (₹)",
        "Mobile Number",
        "PAN Number",
      ]);

      let totalAmount = 0;
      let totalPaid = 0;
      let totalPending = 0;

      if (snapshot.exists()) {
        const data = snapshot.val();
        const items: StallItem[] = Object.keys(data).map((key) => ({
          key,
          ...data[key],
        }));

        items.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

        items.forEach((item) => {
          const amt = item.totalAmount || 0;
          const paid = item.paidAmount || 0;
          const pending = item.pendingAmount || 0;
          totalAmount += amt;
          totalPaid += paid;
          totalPending += pending;
          rows.push([
            item.date || "",
            item.stallNumber ?? "",
            item.name || "",
            item.stallType || "",
            item.quantity ?? 1,
            amt,
            paid,
            pending,
            item.mobileNumber || "",
            item.panNumber || "",
          ]);
        });
      }

      rows.push([]);
      rows.push(["", "", "", "", "Total", totalAmount, totalPaid, totalPending, "", ""]);

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);

      ws["!cols"] = [
        { wch: 12 }, { wch: 14 }, { wch: 25 }, { wch: 12 }, { wch: 10 },
        { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
      ];

      XLSX.utils.book_append_sheet(wb, ws, "Stall Report");
      XLSX.writeFile(wb, `Stall_Report_${selectedYear}.xlsx`);
    } catch (error) {
      console.error("Error generating stall report:", error);
      alert("Error generating stall report. Please try again.");
    } finally {
      setGenerating(null);
    }
  };

  // ==================== Advertisement Report ====================
  const generateAdReport = async () => {
    setGenerating("ad");
    try {
      const snapshot = await get(ref(db, dbPath.ads(selectedYear)));
      const rows: any[][] = [];

      rows.push([
        "Date",
        "Name",
        "Ad Type",
        "Size / Video Length",
        "Quantity",
        "Total Amount (₹)",
        "Paid Amount (₹)",
        "Pending Amount (₹)",
        "Mobile Number",
        "PAN Number",
      ]);

      let totalAmount = 0;
      let totalPaid = 0;
      let totalPending = 0;

      if (snapshot.exists()) {
        const data = snapshot.val();
        const items: AdItem[] = Object.keys(data).map((key) => ({
          key,
          ...data[key],
        }));

        items.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

        items.forEach((item) => {
          const amt = item.totalAmount || 0;
          const paid = item.paidAmount || 0;
          const pending = item.pendingAmount || 0;
          totalAmount += amt;
          totalPaid += paid;
          totalPending += pending;
          const sizeInfo = item.adType === 'Banner' ? (item.size || '') : (item.videoLength ? `${item.videoLength}s` : '');
          rows.push([
            item.date || "",
            item.name || "",
            item.adType || "",
            sizeInfo,
            item.quantity ?? 1,
            amt,
            paid,
            pending,
            item.mobileNumber || "",
            item.panNumber || "",
          ]);
        });
      }

      rows.push([]);
      rows.push(["", "", "", "", "Total", totalAmount, totalPaid, totalPending, "", ""]);

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);

      ws["!cols"] = [
        { wch: 12 }, { wch: 25 }, { wch: 12 }, { wch: 18 }, { wch: 10 },
        { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
      ];

      XLSX.utils.book_append_sheet(wb, ws, "Advertisement Report");
      XLSX.writeFile(wb, `Advertisement_Report_${selectedYear}.xlsx`);
    } catch (error) {
      console.error("Error generating advertisement report:", error);
      alert("Error generating advertisement report. Please try again.");
    } finally {
      setGenerating(null);
    }
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div>Loading...</div>
        </div>
      </ProtectedRoute>
    );
  }

  const reportCards = [
    {
      id: "income",
      title: "Income Report",
      description: "Generate Excel report of all income records for the selected financial year.",
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: "green",
      bgColor: "bg-green-50",
      borderColor: "border-green-200",
      btnColor: "bg-green-600 hover:bg-green-700 focus:ring-green-500",
      action: generateIncomeReport,
    },
    {
      id: "expense",
      title: "Expense Report",
      description: "Generate Excel report of all expense records for the selected financial year.",
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
      color: "red",
      bgColor: "bg-red-50",
      borderColor: "border-red-200",
      btnColor: "bg-red-600 hover:bg-red-700 focus:ring-red-500",
      action: generateExpenseReport,
    },
    {
      id: "paid",
      title: "Membership Paid Report",
      description: "Generate Excel report of all members who have paid their membership fees.",
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: "blue",
      bgColor: "bg-blue-50",
      borderColor: "border-blue-200",
      btnColor: "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500",
      action: generateMembershipPaidReport,
    },
    {
      id: "unpaid",
      title: "Membership Unpaid Report",
      description: "Generate Excel report of all members who have not paid their membership fees.",
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: "orange",
      bgColor: "bg-orange-50",
      borderColor: "border-orange-200",
      btnColor: "bg-orange-600 hover:bg-orange-700 focus:ring-orange-500",
      action: generateMembershipUnpaidReport,
    },
    {
      id: "donation",
      title: "Donation Report",
      description: "Generate Excel report of all donation records for the selected financial year.",
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      ),
      color: "pink",
      bgColor: "bg-pink-50",
      borderColor: "border-pink-200",
      btnColor: "bg-pink-600 hover:bg-pink-700 focus:ring-pink-500",
      action: generateDonationReport,
    },
    {
      id: "stall",
      title: "Stall Booking Report",
      description: "Generate Excel report of all stall booking records for the selected financial year.",
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
      color: "teal",
      bgColor: "bg-teal-50",
      borderColor: "border-teal-200",
      btnColor: "bg-teal-600 hover:bg-teal-700 focus:ring-teal-500",
      action: generateStallReport,
    },
    {
      id: "ad",
      title: "Advertisement Report",
      description: "Generate Excel report of all advertisement booking records for the selected financial year.",
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
        </svg>
      ),
      color: "violet",
      bgColor: "bg-violet-50",
      borderColor: "border-violet-200",
      btnColor: "bg-violet-600 hover:bg-violet-700 focus:ring-violet-500",
      action: generateAdReport,
    },
  ];

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center mb-6">
            <button
              onClick={() => router.push("/dashboard")}
              className="mr-4 text-blue-600 hover:text-blue-800"
            >
              ← Back to Dashboard
            </button>
            <h1 className="text-3xl font-bold">Reports</h1>
          </div>

          <div className="mb-6 bg-white rounded-lg shadow-md px-5 py-3.5 flex items-center gap-3">
            <div className="bg-indigo-100 p-2 rounded-lg">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-500">Financial Year</p>
              <p className="text-lg font-semibold text-gray-800">{formatFinancialYear(selectedYear)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {reportCards.map((report) => (
              <div
                key={report.id}
                className={`bg-white rounded-lg shadow-md overflow-hidden border ${report.borderColor}`}
              >
                <div className={`${report.bgColor} px-5 py-4 flex items-center gap-3 border-b ${report.borderColor}`}>
                  <div className={`text-${report.color}-600`}>
                    {report.icon}
                  </div>
                  <h2 className="text-lg font-semibold text-gray-800">{report.title}</h2>
                </div>
                <div className="p-5">
                  <p className="text-sm text-gray-600 mb-4">{report.description}</p>
                  <button
                    onClick={report.action}
                    disabled={generating !== null}
                    className={`w-full flex items-center justify-center gap-2 ${report.btnColor} text-white px-4 py-3 rounded-md focus:outline-none focus:ring-2 font-medium text-sm transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {generating === report.id ? (
                      <>
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Generating...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Download Excel
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}