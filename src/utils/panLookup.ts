"use client";
import { db } from "../firebase/config";
import { ref, get, set, push } from "firebase/database";
import { dbPath } from "../utils/constants";

/**
 * Look up PAN number by name, searching Patron first, then Members.
 * Returns the PAN if found, or empty string if not found.
 */
export async function lookupPanByName(name: string, selectedYear: string): Promise<string> {
  if (!name.trim()) return "";

  const trimmedName = name.trim().toLowerCase();

  try {
    // Step 1: Search in Patron node (root-level)
    const patronRef = ref(db, dbPath.patron);
    const patronSnapshot = await get(patronRef);
    if (patronSnapshot.exists()) {
      const patronData = patronSnapshot.val();
      for (const key of Object.keys(patronData)) {
        const record = patronData[key];
        const recordName = (record.name || record.patronName || "").toString().toLowerCase();
        if (recordName === trimmedName) {
          const foundPan = record.panNumber || record.pan || "";
          if (foundPan) {
            return foundPan.toString().toUpperCase();
          }
        }
      }
    }

    // Step 2: If not found in Patron, search in Members for the selected year
    const membersRef = ref(db, dbPath.members(selectedYear));
    const membersSnapshot = await get(membersRef);
    if (membersSnapshot.exists()) {
      const membersData = membersSnapshot.val();
      for (const key of Object.keys(membersData)) {
        const record = membersData[key];
        const recordName = (record.name || "").toString().toLowerCase();
        if (recordName === trimmedName) {
          const foundPan = record.panNumber || "";
          if (foundPan) {
            return foundPan.toString().toUpperCase();
          }
        }
      }
    }
  } catch (error) {
    console.error("Error looking up PAN:", error);
  }

  return "";
}

/**
 * Save a new patron entry under the Patron node for future lookups.
 * Only saves if the name has a PAN and the name doesn't already exist in Patron.
 */
export async function savePatronIfNeeded(name: string, panNumber: string): Promise<void> {
  if (!name.trim() || !panNumber.trim()) return;

  const trimmedName = name.trim().toLowerCase();

  try {
    // Check if this name already exists in Patron
    const patronRef = ref(db, dbPath.patron);
    const patronSnapshot = await get(patronRef);

    if (patronSnapshot.exists()) {
      const patronData = patronSnapshot.val();
      for (const key of Object.keys(patronData)) {
        const record = patronData[key];
        const recordName = (record.name || record.patronName || "").toString().toLowerCase();
        if (recordName === trimmedName) {
          // Name already exists, update PAN if different
          const existingPan = record.panNumber || record.pan || "";
          if (existingPan !== panNumber) {
            await set(ref(db, `${dbPath.patron}/${key}`), {
              name: name.trim(),
              panNumber: panNumber.toUpperCase(),
              updatedAt: new Date().toISOString(),
            });
          }
          return;
        }
      }
    }

    // Name not found, create new patron entry
    const newPatronRef = push(ref(db, dbPath.patron));
    await set(newPatronRef, {
      name: name.trim(),
      panNumber: panNumber.toUpperCase(),
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error saving patron:", error);
  }
}