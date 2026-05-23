"use client";
import { useAuth } from "../context/AuthContext";
import { useEffect, useState } from "react";
import { getUserDoc } from "../utils/getUserDoc";
import { useRouter } from "next/navigation";

export default function RootPage() {
  const { user, loading } = useAuth();
  const [checkingUserType, setCheckingUserType] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace("/login");
      return;
    }

    // User is authenticated, fetch their userDoc to determine user type
    getUserDoc(user.uid)
      .then((userData) => {
        if (userData?.userType === "Member") {
          router.replace("/member-landing");
        } else {
          router.replace("/dashboard");
        }
      })
      .catch(() => {
        router.replace("/dashboard");
      })
      .finally(() => setCheckingUserType(false));
  }, [user, loading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div>Loading...</div>
    </div>
  );
}