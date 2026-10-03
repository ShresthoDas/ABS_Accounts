"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ref, get, runTransaction } from "firebase/database";
import { useAuth } from "../../context/AuthContext";
import ProtectedRoute from "../../components/ProtectedRoute";
import { useFinancialYear } from "../../context/FinancialYearContext";
import { db } from "../../firebase/config";
import { dbPath } from "../../utils/constants";
import { logAudit } from "../../utils/auditLog";

type Registration = {
  key: string;
  userType: "member" | "non-member";
  memberId?: string | null;
  mobileNumber?: string | null;
  name: string;
  eventName: string;
  date: string;
  tokens: string[];
  completedTokens?: string[];
};

type ParticipantFilter = "member" | "non-member";
type StatusFilter = "all" | "pending" | "completed";

export default function EventTokenTrackerPage() {
  const { user } = useAuth();
  const { selectedYear } = useFinancialYear();
  const router = useRouter();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [participantFilter, setParticipantFilter] = useState<ParticipantFilter>("member");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [savingToken, setSavingToken] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const fetchRegistrations = async () => {
      setLoading(true);
      setError("");
      try {
        const snapshot = await get(ref(db, dbPath.eventRegistrations(selectedYear)));
        const data = snapshot.val() as Record<string, Omit<Registration, "key">> | null;
        const list: Registration[] = data
          ? Object.entries(data).map(([key, registration]) => ({ key, ...registration } as Registration))
          : [];
        if (!cancelled) setRegistrations(list);
      } catch (fetchError) {
        console.error("Error fetching event registrations:", fetchError);
        if (!cancelled) setError("Unable to load event tokens. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchRegistrations();
    return () => {
      cancelled = true;
    };
  }, [selectedYear]);

  const filteredRegistrations = registrations.filter((registration) => registration.userType === participantFilter);
  const allTokens = filteredRegistrations.flatMap((registration) =>
    (registration.tokens || []).map((token) => ({
      registration,
      token,
      completed: registration.completedTokens?.includes(token) || false,
    }))
  );
  const visibleTokens = allTokens.filter(({ completed }) =>
    statusFilter === "all" || (statusFilter === "completed" ? completed : !completed)
  );
  const pendingCount = allTokens.filter(({ completed }) => !completed).length;
  const completedCount = allTokens.length - pendingCount;

  const setTokenCompleted = async (registration: Registration, token: string, completed: boolean) => {
    setSavingToken(token);
    setError("");
    const completedTokensRef = ref(
      db,
      `${dbPath.eventRegistrations(selectedYear)}/${registration.key}/completedTokens`
    );

    try {
      const result = await runTransaction(completedTokensRef, (current) => {
        const completedTokens = new Set<string>(Array.isArray(current) ? current : []);
        if (completed) completedTokens.add(token);
        else completedTokens.delete(token);
        return Array.from(completedTokens);
      });

      if (!result.committed) throw new Error("Completion update was not committed.");

      const completedTokens = result.snapshot.val() as string[] | null;
      const updatedRegistration: Registration = {
        ...registration,
        completedTokens: completedTokens || [],
      };
      setRegistrations((current) => current.map((item) =>
        item.key === registration.key ? updatedRegistration : item
      ));

      await logAudit({
        action: "UPDATE",
        entityType: "EventRegistration",
        entityId: registration.key,
        previousData: registration,
        newData: updatedRegistration,
        changedBy: user?.email || "Unknown",
        changedByUid: user?.uid || "",
        changedAt: new Date().toISOString(),
      });
    } catch (saveError) {
      console.error("Error updating event token status:", saveError);
      const details = saveError instanceof Error ? saveError.message : String(saveError);
      setError(`Unable to update token status. ${details}`);
    } finally {
      setSavingToken("");
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 px-4 py-8">
        <main className="mx-auto max-w-5xl">
          <div className="mb-6 flex flex-wrap items-center gap-4">
            <button onClick={() => router.push("/dashboard")} className="text-blue-600 hover:text-blue-800">
              ← Back to Dashboard
            </button>
            <h1 className="text-2xl font-bold text-gray-900">Event Token Tracker</h1>
          </div>

          <section className="border-b border-gray-200 pb-5">
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-gray-700">Registration type</legend>
              <div className="inline-flex rounded-md border border-gray-300 bg-white p-1">
                {(["member", "non-member"] as const).map((type) => (
                  <label key={type} className={`cursor-pointer rounded px-4 py-2 text-sm ${participantFilter === type ? "bg-indigo-600 text-white" : "text-gray-700 hover:bg-gray-100"}`}>
                    <input
                      type="radio"
                      name="participantFilter"
                      value={type}
                      checked={participantFilter === type}
                      onChange={() => setParticipantFilter(type)}
                      className="sr-only"
                    />
                    {type === "member" ? "Members" : "Non-Members"}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="mt-4">
              <legend className="mb-2 text-sm font-medium text-gray-700">Completion status</legend>
              <div className="flex flex-wrap gap-2">
                {(["all", "pending", "completed"] as const).map((status) => (
                  <label key={status} className={`cursor-pointer rounded-md border px-3 py-2 text-sm ${statusFilter === status ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}>
                    <input
                      type="radio"
                      name="statusFilter"
                      value={status}
                      checked={statusFilter === status}
                      onChange={() => setStatusFilter(status)}
                      className="sr-only"
                    />
                    {status === "all" ? "All" : status === "pending" ? "Pending" : "Completed"}
                  </label>
                ))}
              </div>
            </fieldset>
          </section>

          <div className="flex flex-wrap gap-x-6 gap-y-2 py-4 text-sm text-gray-600">
            <span>{allTokens.length} total tokens</span>
            <span>{pendingCount} pending</span>
            <span>{completedCount} completed</span>
          </div>

          {error && <p role="alert" className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {loading ? (
            <p className="py-10 text-center text-gray-500">Loading tokens...</p>
          ) : visibleTokens.length === 0 ? (
            <p className="py-10 text-center text-gray-500">No tokens found for these filters.</p>
          ) : (
            <div className="divide-y divide-gray-200 border-y border-gray-200 bg-white">
              {visibleTokens.map(({ registration, token, completed }) => (
                <div key={`${registration.key}-${token}`} className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="break-all font-mono text-base font-semibold text-gray-900">{token}</p>
                    <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
                      <div><dt className="inline text-gray-500">Name: </dt><dd className="inline text-gray-800">{registration.name || "-"}</dd></div>
                      {registration.userType === "member" ? (
                        <div><dt className="inline text-gray-500">Member ID: </dt><dd className="inline text-gray-800">{registration.memberId || "-"}</dd></div>
                      ) : (
                        <div><dt className="inline text-gray-500">Mobile: </dt><dd className="inline text-gray-800">{registration.mobileNumber || "-"}</dd></div>
                      )}
                      <div><dt className="inline text-gray-500">Event: </dt><dd className="inline text-gray-800">{registration.eventName}</dd></div>
                      <div><dt className="inline text-gray-500">Date: </dt><dd className="inline text-gray-800">{registration.date}</dd></div>
                    </dl>
                  </div>
                  <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm font-medium text-gray-700">
                    <input
                      type="checkbox"
                      checked={completed}
                      disabled={savingToken === token}
                      onChange={(event) => setTokenCompleted(registration, token, event.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    {savingToken === token ? "Saving..." : completed ? "Completed" : "Mark completed"}
                  </label>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}