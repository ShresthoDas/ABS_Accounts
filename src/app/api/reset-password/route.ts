import { NextRequest, NextResponse } from "next/server";
import * as admin from "firebase-admin";

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  });
}

const authAdmin = admin.auth();

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Update user password to default Test123
    const user = await authAdmin.getUserByEmail(email);
    await authAdmin.updateUser(user.uid, { password: "Test123" });

    return NextResponse.json({ success: true, message: "Password reset successfully to Test123" });
  } catch (error: any) {
    console.error("Reset password error:", error);
    if (error.code === "auth/user-not-found") {
      return NextResponse.json({ error: "User not found with this email" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to reset password. " + (error.message || "") }, { status: 500 });
  }
}