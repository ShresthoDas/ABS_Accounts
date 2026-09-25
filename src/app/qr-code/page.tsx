"use client";
import { useAuth } from "../../context/AuthContext";
import ProtectedRoute from "../../components/ProtectedRoute";
import { useRouter } from "next/navigation";
import { ROUTES } from "../../utils/constants";
import { useRef } from "react";

export default function QRCodePage() {
  const { user } = useAuth();
  const router = useRouter();
  const errorMessageRef = useRef<HTMLParagraphElement>(null);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-xl mx-auto">
          <div className="flex items-center mb-6">
            <button
              onClick={() => router.push("/dashboard")}
              className="mr-4 text-blue-600 hover:text-blue-800"
            >
              ← Back to Dashboard
            </button>
            <h1 className="text-3xl font-bold">UPI QR Code</h1>
          </div>

          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="bg-indigo-500 text-white p-6 text-center">
              <h2 className="text-xl font-semibold">Scan to Pay</h2>
              <p className="text-indigo-100 mt-1">Agradoot Bangosamaj</p>
            </div>

            <div className="p-8 text-center">
              <div className="inline-block bg-gray-50 border border-gray-200 rounded-lg p-4">
                <img
                  src="/ABS_QR.jpg"
                  alt="UPI QR Code for Agradoot Bangosamaj"
                  className="max-w-xs h-auto mx-auto"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                    if (errorMessageRef.current) errorMessageRef.current.style.display = "block";
                  }}
                />
                <p ref={errorMessageRef} className="mt-2 text-sm text-gray-500 hidden">QR code image not found at /ABS_QR.jpg</p>
              </div>

              <div className="mt-6 space-y-2 text-gray-600">
                <p className="font-medium text-gray-800">Agradoot Bangosamaj</p>
                <p className="text-sm">Scan this QR code to make UPI payments</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}