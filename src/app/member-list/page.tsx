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

interface MemberItem {
  key: string;
  memberId: string;
  name: string;
  fatherName: string;
  mobileNumber: string;
  amount: number;
  paymentStatus: boolean;
}

export default function MemberListPage() {
  const { user } = useAuth();
  const { selectedYear } = useFinancialYear();
  const [userData, setUserData] = useState<any>(null);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<string>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const router = useRouter();

  useEffect(() => {
    if (user) {
      getUserDoc(user.uid).then((data) => setUserData(data));
    }
  }, [user]);

  const fetchMembers = async () => {
    setMembersLoading(true);
    try {
      const currentYear = selectedYear;
      const membersRef = ref(db, dbPath.members(currentYear));
      const snapshot = await get(membersRef);
      if (snapshot.exists()) {
        const data = snapshot.val();
        const list: MemberItem[] = Object.keys(data).map((key) => ({
          key,
          ...data[key],
        }));
        setMembers(list);
      } else {
        setMembers([]);
      }
    } catch (error) {
      console.error("Error fetching members:", error);
    } finally {
      setMembersLoading(false);
    }
  };

  useEffect(() => {
    if (userData) {
      fetchMembers();
    }
  }, [userData, selectedYear]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const filteredMembers = members.filter((m) =>
    m.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.memberId?.toLowerCase().includes(searchQuery.toLowerCase()) 
  );

  const sortedMembers = [...filteredMembers].sort((a, b) => {
    const aVal = a[sortField as keyof MemberItem];
    const bVal = b[sortField as keyof MemberItem];
    if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  const totalCollected = members.reduce((sum, m) => sum + (m.paymentStatus ? (m.amount || 0) : 0), 0);
  const totalPending = members.reduce((sum, m) => sum + (m.paymentStatus ? 0 : (m.amount || 0)), 0);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center">
              <button onClick={() => router.push("/dashboard")} className="mr-4 text-blue-600 hover:text-blue-800">← Back to Dashboard</button>
              <h1 className="text-3xl font-bold">Member List</h1>
            </div>
            <div className="flex gap-3">
              <button onClick={fetchMembers} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">↻ Refresh</button>
              <button onClick={() => router.push("/add-member")} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm">+ Add Member</button>
            </div>
          </div>

          {/* Search */}
          <div className="mb-4">
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by name, member ID, or father's name..." className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm text-green-700">Total Collected</p>
              <p className="text-2xl font-bold text-green-600">₹ {totalCollected.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-700">Total Pending</p>
              <p className="text-2xl font-bold text-red-600">₹ {totalPending.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow overflow-x-auto">
            {membersLoading ? (
              <div className="p-6 text-center text-gray-500">Loading...</div>
            ) : sortedMembers.length === 0 ? (
              <div className="p-6 text-center text-gray-500">No members found.</div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {["memberId", "name", "mobileNumber", "amount", "paymentStatus"].map((field) => (
                      <th key={field} onClick={() => handleSort(field)} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                        <div className="flex items-center gap-1">
                          {field === "memberId" ? "Member ID" : field === "fatherName" ? "Father's Name" : field === "mobileNumber" ? "Mobile" : field === "paymentStatus" ? "Status" : field.charAt(0).toUpperCase() + field.slice(1)}
                          {sortField === field && <span>{sortDirection === "asc" ? "▲" : "▼"}</span>}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sortedMembers.map((member) => (
                    <tr key={member.key} onClick={() => router.push(`/member-list/${member.key}`)} className="hover:bg-gray-50 cursor-pointer">
                      <td className="px-4 py-3 whitespace-nowrap text-sm">{member.memberId}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">{member.name}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">{member.mobileNumber}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">₹ {member.amount?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${member.paymentStatus ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                          {member.paymentStatus ? "Paid" : "Pending"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}