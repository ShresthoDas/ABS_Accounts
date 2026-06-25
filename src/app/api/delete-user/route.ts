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
    const { uid } = await request.json();

    if (!uid) {
      return NextResponse.json({ error: "UID is required" }, { status: 400 });
    }

    // Step 1: Delete user from Firebase Auth
    await authAdmin.deleteUser(uid);

    // Step 2: Delete user data from Realtime Database
    const dbAdmin = admin.database();
    const root = process.env.NEXT_PUBLIC_ROOT || (process.env.NODE_ENV === 'production' ? 'PROD/Accounts' : 'UAT/Accounts');
    const userRef = dbAdmin.ref(`${root}/Users/${uid}`);
    await userRef.remove();

    return NextResponse.json({ success: true, message: "User deleted successfully from Auth and Database." });
  } catch (error: any) {
    console.error("Delete user error:", error);
    if (error.code === "auth/user-not-found") {
      // If user not found in Auth, still try to clean up DB
      try {
        const { uid } = await request.json();
        const dbAdmin = admin.database();
        const root = process.env.NEXT_PUBLIC_ROOT || (process.env.NODE_ENV === 'production' ? 'PROD/Accounts' : 'UAT/Accounts');
        const userRef = dbAdmin.ref(`${root}/Users/${uid}`);
        await userRef.remove();
        return NextResponse.json({ success: true, message: "User removed from database (Auth user not found)." });
      } catch (dbError: any) {
        return NextResponse.json({ error: "User not found in Auth and failed to clean up database." }, { status: 404 });
      }
    }
    return NextResponse.json({ error: "Failed to delete user. " + (error.message || "") }, { status: 500 });
  }
}