import { db } from "../firebase/config";
import { ref, get } from "firebase/database";
import {DB_PATHS} from "./constants";

// Fetch a user document by uid from Firebase Realtime Database
export async function getUserDoc(uid: string) {
  const userRef = ref(db, `${DB_PATHS.ROOT}/${DB_PATHS.USERS}/${uid}`);
  const snapshot = await get(userRef);
  if (snapshot.exists()) {
    console.log("User data:", snapshot.val());
    return snapshot.val();
  }
  return null;
}