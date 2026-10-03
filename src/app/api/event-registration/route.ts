import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { DB_PATHS, dbPath, getCurrentYearString } from "../../../utils/constants";
import { adminAuth, adminDatabase } from "../../../utils/firebaseAdmin";

const ALLOWED_EVENTS = new Set(["Sindoor Dan"]);
const RATE_WINDOW_MS = 60_000;

type UserType = "member" | "non-member";
type MemberRecord = {
  memberId?: string;
  name?: string;
  mobileNumber?: string;
  paymentStatus?: boolean;
};
type RegistrationRecord = {
  key: string;
  userType: UserType;
  memberId: string | null;
  name: string;
  mobileNumber: string | null;
  eventName: string;
  numberOfMembers: number;
  tokens: string[];
  completedTokens?: string[];
  date: string;
  createdAt: string;
  createdBy: string;
  ownerUid?: string;
  ownerEmail?: string;
  updatedAt?: string;
};
type VerifiedIdentity = { uid: string; email: string };

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const normalizePhone = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (value.trim().startsWith("+") && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return "";
};

const publicRegistration = (registration: RegistrationRecord) => ({
  key: registration.key,
  userType: registration.userType,
  memberId: registration.memberId,
  name: registration.name,
  mobileNumber: registration.mobileNumber,
  eventName: registration.eventName,
  numberOfMembers: registration.numberOfMembers,
  tokens: registration.tokens,
  completedTokens: registration.completedTokens || [],
  date: registration.date,
});

const getTokenQueueStats = (
  registrations: RegistrationRecord[],
  userType: UserType,
  participantMatches: (registration: RegistrationRecord) => boolean
) => {
  const prefix = userType === "member" ? "abs-mem" : "abs-nonmem";
  const tokenPattern = new RegExp(`^${prefix}-(\\d+)-(\\d+)$`);
  const tokens = registrations
    .filter((registration) => registration.userType === userType)
    .flatMap((registration) => (registration.tokens || []).flatMap((token) => {
      const match = token.match(tokenPattern);
      return match ? [{ registration, token, registrationNumber: Number(match[1]), attendeeNumber: Number(match[2]) }] : [];
    }))
    .sort((a, b) => a.registrationNumber - b.registrationNumber || a.attendeeNumber - b.attendeeNumber);
  const matchingRegistration = registrations.find((registration) =>
    registration.userType === userType && participantMatches(registration)
  );
  const hasAnyCompletedToken = tokens.some(({ registration, token }) =>
    registration.completedTokens?.includes(token)
  );
  const selectedTokens = new Set(
    (matchingRegistration?.tokens || []).filter((token) => tokenPattern.test(token))
  );
  const firstSelectedTokenIndex = matchingRegistration
    ? tokens.findIndex(({ token }) => selectedTokens.has(token))
    : -1;
  const lastSelectedTokenIndex = matchingRegistration
    ? tokens.reduce((lastIndex, { token }, index) => selectedTokens.has(token) ? index : lastIndex, -1)
    : -1;
  const selectedTokensFound = firstSelectedTokenIndex >= 0;
  const hasCompletedTokenAfterSelection = lastSelectedTokenIndex >= 0
    && tokens.slice(lastSelectedTokenIndex + 1).some(({ registration, token }) =>
      registration.completedTokens?.includes(token)
    );
  const tokensBeforeSelection = selectedTokensFound
    ? tokens.slice(0, firstSelectedTokenIndex)
    : tokens;
  const completedTokenCount = tokens.slice(
    0,
    selectedTokensFound ? firstSelectedTokenIndex + selectedTokens.size : tokens.length
  ).filter(({ registration, token }) =>
    registration.completedTokens?.includes(token)
  ).length;
  const pendingTokensBefore = tokensBeforeSelection.filter(({ registration, token }) =>
    !registration.completedTokens?.includes(token)
  ).length;
  const selectedCompletedTokenCount = matchingRegistration
    ? Array.from(selectedTokens).filter((token) =>
        matchingRegistration.completedTokens?.includes(token)
      ).length
    : 0;

  return {
    hasAnyCompletedToken,
    hasCompletedTokenAfterSelection,
    completedTokenCount,
    selectedCompletedTokenCount,
    totalRegisteredTokens: tokens.length,
    isRegistered: Boolean(matchingRegistration && selectedTokensFound),
    pendingTokensBefore,
  };
};

const enforceRateLimit = async (request: NextRequest, action: string) => {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0].trim();
  const ip = request.headers.get("x-real-ip") || forwardedFor || "unknown";
  const ipHash = createHash("sha256").update(ip).digest("hex");
  const limits: Record<string, number> = { members: 30, lookup: 15, create: 5, update: 10, delete: 10 };
  const limit = limits[action] || 10;
  const rateRef = adminDatabase.ref(`${DB_PATHS.ROOT}/PublicApiRateLimits/EventRegistration/${ipHash}`);
  const now = Date.now();
  const result = await rateRef.transaction((current) => {
    if (!current || now - current.windowStartedAt >= RATE_WINDOW_MS) {
      return { windowStartedAt: now, count: 1 };
    }
    if (current.count >= limit) return;
    return { ...current, count: current.count + 1 };
  });

  if (!result.committed) throw new ApiError(429, "Too many requests. Please wait and try again.");
};

const verifyEmailIdentity = async (request: NextRequest): Promise<VerifiedIdentity> => {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new ApiError(401, "Sign in with a verified email to continue.");

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (!decoded.email || decoded.email_verified !== true) {
      throw new ApiError(401, "Sign in with a verified email address to continue.");
    }
    return { uid: decoded.uid, email: decoded.email };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, "Email sign-in expired. Please sign in again.");
  }
};

const findMember = async (year: string, memberId: string) => {
  const snapshot = await adminDatabase.ref(dbPath.members(year)).get();
  const records = snapshot.val() as Record<string, MemberRecord> | null;
  if (!records) return null;
  const entry = Object.entries(records).find(([, member]) =>
    member.memberId?.trim().toLowerCase() === memberId.trim().toLowerCase()
  );
  return entry ? entry[1] : null;
};

const authorizeParticipant = async (
  year: string,
  userType: UserType,
  memberId?: string,
  mobileNumber?: string
) => {
  if (userType === "member") {
    if (!memberId) throw new ApiError(400, "Select a member.");
    const member = await findMember(year, memberId);
    if (!member || member.paymentStatus !== true) throw new ApiError(400, "Paid member not found.");
    return member;
  }

  if (!mobileNumber?.trim()) throw new ApiError(400, "Mobile number is required.");
  return null;
};

const authorizeExistingRegistration = async (
  registration: RegistrationRecord,
  identity: VerifiedIdentity
) => {
  if (registration.ownerUid !== identity.uid && registration.createdBy !== identity.uid) {
    throw new ApiError(403, "This registration belongs to another account or predates account ownership. Contact the event administrator.");
  }
};

const writeAudit = async (
  year: string,
  action: "CREATE" | "UPDATE" | "DELETE",
  registrationKey: string,
  previousData: unknown,
  newData: unknown,
  identity: VerifiedIdentity
) => {
  try {
    const auditRef = adminDatabase.ref(`${DB_PATHS.ROOT}/${year}/AuditLog`).push();
    await auditRef.set({
      action,
      entityType: "EventRegistration",
      entityId: registrationKey,
      previousData,
      newData,
      changedBy: identity.email,
      changedByUid: identity.uid,
      changedAt: new Date().toISOString(),
      auditId: auditRef.key,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Event registration audit write failed:", error);
  }
};

const validateRegistrationFields = (body: Record<string, unknown>) => {
  const userType = body.userType;
  const eventName = typeof body.eventName === "string" ? body.eventName.trim() : "";
  const numberOfMembers = Number(body.numberOfMembers);

  if (userType !== "member" && userType !== "non-member") throw new ApiError(400, "Select a participant type.");
  if (!ALLOWED_EVENTS.has(eventName)) throw new ApiError(400, "Select a valid event.");
  if (!Number.isInteger(numberOfMembers) || numberOfMembers < 1 || numberOfMembers > 5) {
    throw new ApiError(400, "Number of members must be between 1 and 5.");
  }

  return { userType: userType as UserType, eventName, numberOfMembers };
};

const reserveTokens = async (userType: UserType, count: number) => {
  const counterPath = userType === "member" ? dbPath.eventTokenCounter() : dbPath.eventNonMemberTokenCounter();
  const counterRef = adminDatabase.ref(counterPath);
  const result = await counterRef.transaction((lastNumber) => {
    const current = typeof lastNumber === "number" ? lastNumber : userType === "member" ? 30 : 0;
    return current + 1;
  });
  if (!result.committed) throw new ApiError(500, "Unable to reserve token numbers.");

  const tokenNumber = result.snapshot.val() as number;
  const prefix = userType === "member" ? "abs-mem" : "abs-nonmem";
  return Array.from({ length: count }, (_, index) => `${prefix}-${tokenNumber}-${index + 1}`);
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    await enforceRateLimit(request, action);

    const year = getCurrentYearString();
    const registrationsRef = adminDatabase.ref(dbPath.eventRegistrations(year));

    if (action === "members") {
      const snapshot = await adminDatabase.ref(dbPath.members(year)).get();
      const records = snapshot.val() as Record<string, MemberRecord> | null;
      const members = records
        ? Object.values(records)
            .filter((member) => member.paymentStatus === true && member.memberId && member.name)
            .map((member) => ({ memberId: member.memberId, name: member.name }))
            .sort((a, b) => a.memberId!.localeCompare(b.memberId!))
        : [];
      return NextResponse.json({ members }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "lookup") {
      const identity = await verifyEmailIdentity(request);
      const { userType } = validateRegistrationFields({ ...body, eventName: "Sindoor Dan", numberOfMembers: 1 });
      const memberId = typeof body.memberId === "string" ? body.memberId.trim() : "";
      const mobileNumber = typeof body.mobileNumber === "string" ? body.mobileNumber.trim() : "";
      await authorizeParticipant(year, userType, memberId, mobileNumber);

      const snapshot = await registrationsRef.get();
      const records = snapshot.val() as Record<string, Omit<RegistrationRecord, "key">> | null;
      const allRegistrations: RegistrationRecord[] = records
        ? Object.entries(records).map(([key, registration]) => ({ key, ...registration } as RegistrationRecord))
        : [];
      const participantMatches = userType === "member"
        ? (registration: RegistrationRecord) => registration.memberId?.trim().toLowerCase() === memberId.toLowerCase()
        : (registration: RegistrationRecord) => normalizePhone(registration.mobileNumber || "") === normalizePhone(mobileNumber);
      const matches = records
        ? allRegistrations
            .filter((registration) => userType === "member"
              ? registration.userType === "member" && registration.memberId?.toLowerCase() === memberId.toLowerCase()
              : registration.userType === "non-member" && normalizePhone(registration.mobileNumber || "") === normalizePhone(mobileNumber))
            .filter((registration) => registration.ownerUid === identity.uid || registration.createdBy === identity.uid)
            .map(publicRegistration)
        : [];
      const queueStats = getTokenQueueStats(allRegistrations, userType, participantMatches);
      return NextResponse.json({ registrations: matches, queueStats }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "create") {
      const identity = await verifyEmailIdentity(request);
      const { userType, eventName, numberOfMembers } = validateRegistrationFields(body);
      const memberId = typeof body.memberId === "string" ? body.memberId.trim() : "";
      const mobileNumber = typeof body.mobileNumber === "string" ? body.mobileNumber.trim() : "";
      const submittedName = typeof body.name === "string" ? body.name.trim() : "";
      const member = await authorizeParticipant(year, userType, memberId, mobileNumber);
      const name = userType === "member" ? member?.name?.trim() || "" : submittedName;
      if (!name) throw new ApiError(400, "Name is required.");

      const existingSnapshot = await registrationsRef.get();
      const existing = existingSnapshot.val() as Record<string, RegistrationRecord> | null;
      const duplicate = existing && Object.values(existing).find((registration) => userType === "member"
        ? registration.userType === "member" && registration.memberId?.toLowerCase() === memberId.toLowerCase()
        : registration.userType === "non-member" && normalizePhone(registration.mobileNumber || "") === normalizePhone(mobileNumber));
      if (duplicate) {
        if (duplicate.ownerUid !== identity.uid && duplicate.createdBy !== identity.uid) {
          throw new ApiError(409, "A prior registration exists but is not linked to this account. Contact an administrator to link it.");
        }
        throw new ApiError(409, "A registration already exists for this participant. Look it up to edit it.");
      }

      const tokens = await reserveTokens(userType, numberOfMembers);
      const registrationRef = registrationsRef.push();
      const registration: RegistrationRecord = {
        key: registrationRef.key!,
        userType,
        memberId: userType === "member" ? memberId : null,
        name,
        mobileNumber: userType === "non-member" ? mobileNumber : null,
        eventName,
        numberOfMembers,
        tokens,
        completedTokens: [],
        date: new Date().toISOString().split("T")[0],
        createdAt: new Date().toISOString(),
        createdBy: identity.uid,
        ownerUid: identity.uid,
        ownerEmail: identity.email,
      };
      await registrationRef.set(registration);
      await writeAudit(year, "CREATE", registration.key, null, registration, identity);
      return NextResponse.json({ registration: publicRegistration(registration) }, { status: 201, headers: { "Cache-Control": "no-store" } });
    }

    if (action === "update" || action === "delete") {
      const identity = await verifyEmailIdentity(request);
      const registrationKey = typeof body.registrationKey === "string" ? body.registrationKey : "";
      if (!registrationKey || /[.#$\[\]/]/.test(registrationKey)) throw new ApiError(400, "Invalid registration key.");

      const registrationRef = registrationsRef.child(registrationKey);
      const snapshot = await registrationRef.get();
      if (!snapshot.exists()) throw new ApiError(404, "Registration not found.");
      const previous = { key: registrationKey, ...snapshot.val() } as RegistrationRecord;
      await authorizeExistingRegistration(previous, identity);

      if (action === "delete") {
        await registrationRef.remove();
        await writeAudit(year, "DELETE", registrationKey, previous, null, identity);
        return NextResponse.json({ success: true });
      }

      const { eventName, numberOfMembers } = validateRegistrationFields({
        ...body,
        userType: previous.userType,
      });
      const tokenBase = previous.tokens?.[0]?.match(/^(abs-(?:mem|nonmem)-\d+)-\d+$/)?.[1];
      const tokens = tokenBase
        ? Array.from({ length: numberOfMembers }, (_, index) => `${tokenBase}-${index + 1}`)
        : previous.tokens.slice(0, numberOfMembers);
      if (tokens.length !== numberOfMembers) throw new ApiError(400, "This registration cannot change its attendee count.");

      const name = previous.userType === "non-member" && typeof body.name === "string" ? body.name.trim() : previous.name;
      if (!name) throw new ApiError(400, "Name is required.");
      const updated: RegistrationRecord = {
        ...previous,
        eventName,
        numberOfMembers,
        tokens,
        name,
        updatedAt: new Date().toISOString(),
      };
      await registrationRef.set(updated);
      await writeAudit(year, "UPDATE", registrationKey, previous, updated, identity);
      return NextResponse.json({ registration: publicRegistration(updated) }, { headers: { "Cache-Control": "no-store" } });
    }

    throw new ApiError(400, "Unknown event registration action.");
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    }
    console.error("Public event registration API error:", error);
    return NextResponse.json({ error: "Unable to process the event registration request." }, { status: 500 });
  }
}