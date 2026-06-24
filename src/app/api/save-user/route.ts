import { NextRequest, NextResponse } from "next/server";
import * as admin from "firebase-admin";
import {DB_PATHS} from "../../../utils/constants";

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

export async function POST(request: NextRequest) {
  try {
    const { uid, name, mobileNo, userType, email, memberId } = await request.json();

    if (!uid || !name || !mobileNo || !userType) {
      return NextResponse.json({ error: "Missing required fields: uid, name, mobileNo, userType" }, { status: 400 });
    }

    const dbAdmin = admin.database();
    const userRef = dbAdmin.ref(`${DB_PATHS.ROOT}/${DB_PATHS.USERS}/${uid}`);

    await userRef.set({
      name,
      mobileNo,
      userType,
      email: email || "",
      memberId: memberId || null,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, message: "User details saved successfully." });
  } catch (error: any) {
    console.error("Save user error:", error);
    return NextResponse.json({ error: "Failed to save user details. " + (error.message || "") }, { status: 500 });
  }
}