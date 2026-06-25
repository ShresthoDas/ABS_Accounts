"use client";
import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "../../firebase/config";

const errorMessages: Record<string, string> = {
  "auth/user-not-found": "No user found with this email.",
  "auth/wrong-password": "Incorrect password.",
  "auth/invalid-email": "Invalid email address.",
  // Add more as needed
};

export default function LoginPage() {
  const router = useRouter();
  const [mobileNo, setMobileNo] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const email = `${mobileNo}@abs.com`;
      await signInWithEmailAndPassword(auth, email, password);
      router.push("/");
    } catch (err: any) {
      setError(errorMessages[err.code] || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <form
        onSubmit={handleSubmit}
        className="bg-white p-8 rounded shadow-md w-full max-w-md"
      >
        <h2 className="text-2xl font-bold mb-6 text-center">Login</h2>
        {error && <div className="mb-4 text-red-600">{error}</div>}
        <div className="mb-4">
          <label className="block mb-1 font-medium">Mobile Number</label>
          <input
            type="tel"
            className="w-full border px-3 py-2 rounded"
            placeholder="10-digit mobile number"
            value={mobileNo}
            onChange={e => setMobileNo(e.target.value.replace(/\D/g, "").slice(0, 10))}
            required
            autoFocus
          />
          <p className="text-xs text-gray-500 mt-1">
            Enter your registered 10-digit mobile number
          </p>
        </div>
        <div className="mb-6">
          <label className="block mb-1 font-medium">Password</label>
          <input
            type="password"
            className="w-full border px-3 py-2 rounded"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
        </div>
        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
          disabled={loading}
        >
          {loading ? "Logging in..." : "Login"}
        </button>
        <div className="mt-4 text-center text-sm text-gray-600">
          Don't have an account?{' '}
          <button
            type="button"
            className="text-blue-600 hover:text-blue-800 font-semibold"
            onClick={() => router.push("/sign-up")}
          >
            Sign Up
          </button>
        </div>
      </form>
    </div>
  );
}
