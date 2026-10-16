"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getApps, initializeApp } from "firebase/app";
import {
  Auth,
  User,
  GoogleAuthProvider,
  getAuth,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { app } from "../../firebase/config";
import { generateEventRegistrationPDF } from "../../utils/generateEventRegistrationPDF";
import { getCurrentYearString } from "../../utils/constants";

const EVENTS = [
  { value: "Sindoor Dan", label: "Sindoor Dan" },
];

type PaidMember = {
  memberId: string;
  name: string;
  panNumber?: string;
  paymentStatus: boolean;
};

type EventRegistration = {
  key: string;
  userType: "member" | "non-member";
  memberId?: string | null;
  name: string;
  mobileNumber?: string | null;
  eventName: string;
  numberOfMembers: number;
  tokens: string[];
  date: string;
  createdAt?: string;
  createdBy?: string;
  [key: string]: any;
};

type TokenQueueStats = {
  hasAnyCompletedToken: boolean;
  hasCompletedTokenAfterSelection: boolean;
  completedTokenCount: number;
  selectedCompletedTokenCount: number;
  totalRegisteredTokens: number;
  isRegistered: boolean;
  pendingTokensBefore: number;
};

export default function EventRegistrationPage() {
  const [paidMembers, setPaidMembers] = useState<PaidMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState("");
  const [registrations, setRegistrations] = useState<EventRegistration[]>([]);
  const [tokenQueueStats, setTokenQueueStats] = useState<TokenQueueStats | null>(null);
  const [registrationsLoading, setRegistrationsLoading] = useState(false);
  const [lookupComplete, setLookupComplete] = useState(false);
  const lookupRequestId = useRef(0);
  const lastLookupKey = useRef("");

  // Form state
  const [userType, setUserType] = useState<"member" | "non-member" | "">("");
  const [memberId, setMemberId] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [name, setName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [eventName, setEventName] = useState("");
  const [numberOfMembers, setNumberOfMembers] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [memberValidated, setMemberValidated] = useState(false);
  const [memberData, setMemberData] = useState<PaidMember | null>(null);
  const [editingRegistration, setEditingRegistration] = useState<EventRegistration | null>(null);
  const [generatedTokens, setGeneratedTokens] = useState<string[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [identityUser, setIdentityUser] = useState<User | null>(null);
  const [identityIdToken, setIdentityIdToken] = useState("");
  const [emailAddress, setEmailAddress] = useState("");
  const [emailLinkSent, setEmailLinkSent] = useState(false);
  const [emailLinkNeedsAddress, setEmailLinkNeedsAddress] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const authRef = useRef<Auth | null>(null);

  const getPublicAuth = () => {
    if (authRef.current) return authRef.current;
    const authAppName = "public-event-identity-auth";
    const authApp = getApps().find((firebaseApp) => firebaseApp.name === authAppName) || initializeApp(app.options, authAppName);
    authRef.current = getAuth(authApp);
    return authRef.current;
  };

  useEffect(() => {
    let cancelled = false;
    const fetchPaidMembers = async () => {
      setMembersLoading(true);
      try {
        const response = await fetch("/api/event-registration", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "members" }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to load paid members.");
        if (!cancelled) setPaidMembers(result.members as PaidMember[]);
      } catch (error) {
        console.error("Error fetching paid members:", error);
        if (!cancelled) setMembersError(error instanceof Error ? error.message : "Unable to load paid members.");
      } finally {
        if (!cancelled) setMembersLoading(false);
      }
    };
    fetchPaidMembers();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const auth = getPublicAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIdentityUser(user);
      setAuthReady(true);
      setAuthError("");

      if (!user) {
        setIdentityIdToken("");
        return;
      }

      void user.getIdToken().then((token) => {
        if (auth.currentUser?.uid === user.uid) setIdentityIdToken(token);
      }).catch((error) => {
        console.error("Unable to retrieve Firebase sign-in token:", error);
        if (auth.currentUser?.uid === user.uid) {
          setIdentityUser(null);
          setIdentityIdToken("");
          setAuthError("Unable to establish your sign-in session. Please sign in again.");
        }
      });
    });

    if (isSignInWithEmailLink(auth, window.location.href)) {
      const savedEmail = window.localStorage.getItem("eventRegistrationSignInEmail") || "";
      if (savedEmail) {
        setEmailAddress(savedEmail);
        void completeEmailLinkSignIn(auth, savedEmail);
      } else {
        setEmailLinkNeedsAddress(true);
      }
    }

    return unsubscribe;
  }, []);

  const completeEmailLinkSignIn = async (auth: Auth, email: string) => {
    setAuthBusy(true);
    setAuthError("");
    try {
      const result = await signInWithEmailLink(auth, email.trim(), window.location.href);
      window.localStorage.removeItem("eventRegistrationSignInEmail");
      window.history.replaceState({}, document.title, "/event-registration");
      setIdentityUser(result.user);
      setIdentityIdToken(await result.user.getIdToken());
      setEmailLinkNeedsAddress(false);
      setEmailLinkSent(false);
    } catch (error) {
      console.error("Email-link sign-in failed:", error);
      setAuthError(error instanceof Error ? error.message : "Unable to complete email sign-in.");
    } finally {
      setAuthBusy(false);
    }
  };

  const sendEmailSignInLink = async () => {
    if (!emailAddress.trim()) {
      setAuthError("Enter your email address.");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    try {
      const auth = getPublicAuth();
      await sendSignInLinkToEmail(auth, emailAddress.trim(), {
        url: `${window.location.origin}/event-registration`,
        handleCodeInApp: true,
      });
      window.localStorage.setItem("eventRegistrationSignInEmail", emailAddress.trim());
      setEmailLinkSent(true);
      setEmailLinkNeedsAddress(false);
    } catch (error) {
      console.error("Unable to send email sign-in link:", error);
      setAuthError(error instanceof Error ? error.message : "Unable to send the sign-in link.");
    } finally {
      setAuthBusy(false);
    }
  };

  const signInWithGoogle = async () => {
    setAuthBusy(true);
    setAuthError("");
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(getPublicAuth(), provider);
      setIdentityUser(result.user);
      setIdentityIdToken(await result.user.getIdToken());
    } catch (error) {
      console.error("Google sign-in failed:", error);
      setAuthError(error instanceof Error ? error.message : "Unable to sign in with Google.");
    } finally {
      setAuthBusy(false);
    }
  };

  const signOutPublicUser = async () => {
    await signOut(getPublicAuth());
    lookupRequestId.current += 1;
    lastLookupKey.current = "";
    setRegistrationsLoading(false);
    setIdentityUser(null);
    setIdentityIdToken("");
    setLookupComplete(false);
    setRegistrations([]);
    setTokenQueueStats(null);
  };

  const resetRegistrationLookup = () => {
    lookupRequestId.current += 1;
    lastLookupKey.current = "";
    setRegistrationsLoading(false);
    setLookupComplete(false);
    setRegistrations([]);
    setTokenQueueStats(null);
    setAuthError("");
  };

  const findExistingRegistrations = useCallback(async () => {
    if (!identityIdToken) {
      setAuthError("Sign in with email or Google before searching registrations.");
      return;
    }
    const hasLookupValue = userType === "member"
      ? Boolean(memberId.trim())
      : userType === "non-member" && Boolean(mobileNumber.trim());
    if (!hasLookupValue) {
      setAuthError(userType === "member" ? "Select a member first." : "Enter a mobile number first.");
      return;
    }
    const lookupKey = JSON.stringify([identityIdToken, userType, memberId.trim(), mobileNumber.trim()]);
    if (lastLookupKey.current === lookupKey) return;
    lastLookupKey.current = lookupKey;
    const requestId = ++lookupRequestId.current;
    setRegistrationsLoading(true);
    setLookupComplete(false);
    setRegistrations([]);
    setTokenQueueStats(null);
    setAuthError("");
    try {
      const response = await fetch("/api/event-registration", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${identityIdToken}` },
        body: JSON.stringify({ action: "lookup", userType, memberId, mobileNumber }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to search registrations.");
      if (requestId !== lookupRequestId.current) return;
      setRegistrations(result.registrations as EventRegistration[]);
      setTokenQueueStats(result.queueStats as TokenQueueStats);
      setLookupComplete(true);
      setMemberValidated(userType === "member");
    } catch (error) {
      if (requestId !== lookupRequestId.current) return;
      console.error("Registration lookup failed:", error);
      setAuthError(error instanceof Error ? error.message : "Unable to search registrations.");
    } finally {
      if (requestId === lookupRequestId.current) setRegistrationsLoading(false);
    }
  }, [identityIdToken, memberId, mobileNumber, userType]);

  const matchingRegistrations = registrations;
  const hasRegistrationLookup = userType === "member"
    ? Boolean(memberId.trim())
    : userType === "non-member" && Boolean(mobileNumber.trim());
  const canShowRegistrationControls = Boolean(identityIdToken && lookupComplete && !registrationsLoading && registrations.length === 0) || Boolean(editingRegistration);

  useEffect(() => {
    if (!identityIdToken || !hasRegistrationLookup || editingRegistration) return;

    if (userType === "member") {
      void findExistingRegistrations();
      return;
    }

    const digits = mobileNumber.replace(/\D/g, "");
    const mobileNumberReady = digits.length === 10
      || (digits.length === 12 && digits.startsWith("91"))
      || (mobileNumber.trim().startsWith("+") && digits.length >= 8 && digits.length <= 15);
    if (!mobileNumberReady) return;

    const timeout = window.setTimeout(() => void findExistingRegistrations(), 500);
    return () => window.clearTimeout(timeout);
  }, [editingRegistration, findExistingRegistrations, hasRegistrationLookup, identityIdToken, mobileNumber, userType]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!userType) newErrors.userType = "Please select if you are a member or non-member";
    if (userType === "member") {
      if (!memberId.trim()) newErrors.memberId = "Member ID is required";
      if (!name.trim()) newErrors.name = "Name is required";
      if (!memberValidated) newErrors.memberId = "Please validate member details first";
    } else if (userType === "non-member") {
      if (!name.trim()) newErrors.name = "Name is required";
      if (!mobileNumber.trim()) newErrors.mobileNumber = "Mobile number is required";
    }
    if (!eventName) newErrors.eventName = "Please select an event";
    if (!numberOfMembers || numberOfMembers < 1 || numberOfMembers > 5) newErrors.numberOfMembers = "Select 1-5 members";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const startEditingRegistration = (registration: EventRegistration) => {
    setEditingRegistration(registration);
    setUserType(registration.userType);
    setMemberId(registration.memberId || "");
    setMemberSearch(registration.memberId || "");
    setName(registration.name || "");
    if (registration.userType === "non-member") setMobileNumber(registration.mobileNumber || "");
    setMemberData(paidMembers.find((member) => member.memberId === registration.memberId) || null);
    setEventName(registration.eventName);
    setNumberOfMembers(registration.numberOfMembers);
    setMemberValidated(registration.userType === "member");
    setErrors({});
  };

  const cancelEditingRegistration = () => {
    setEditingRegistration(null);
    setEventName("");
    setNumberOfMembers(1);
    if (userType === "member") {
      setName(memberData?.name || "");
      setMemberValidated(Boolean(memberData));
    } else {
      setName("");
    }
    setErrors({});
  };

  const deleteRegistration = async (registration: EventRegistration) => {
    if (!window.confirm(`Delete registration for ${registration.name}?`)) return;

    try {
      const response = await fetch("/api/event-registration", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${identityIdToken}` },
        body: JSON.stringify({ action: "delete", registrationKey: registration.key }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to delete registration.");
      setRegistrations((current) => current.filter((item) => item.key !== registration.key));
      if (editingRegistration?.key === registration.key) cancelEditingRegistration();
    } catch (error) {
      console.error("Error deleting event registration:", error);
      setAuthError(error instanceof Error ? error.message : "Unable to delete this registration.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      setSubmitting(true);
      if (!identityIdToken) throw new Error("Sign in with email or Google before continuing.");
      const participantType = userType as "member" | "non-member";
      const response = await fetch("/api/event-registration", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${identityIdToken}` },
        body: JSON.stringify({
          action: editingRegistration ? "update" : "create",
          registrationKey: editingRegistration?.key,
          userType: participantType,
          memberId: participantType === "member" ? memberId : null,
          mobileNumber,
          name,
          eventName,
          numberOfMembers,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save registration.");
      const savedRegistration = result.registration as EventRegistration;
      const tokens = savedRegistration.tokens;
      setRegistrations((current) => editingRegistration
        ? current.map((item) => item.key === savedRegistration.key ? savedRegistration : item)
        : [...current, savedRegistration]);

      await generateEventRegistrationPDF({
        registrationKey: savedRegistration.key,
        date: savedRegistration.date,
        userType: participantType,
        memberId: savedRegistration.memberId || null,
        name: savedRegistration.name,
        mobileNumber: savedRegistration.mobileNumber || null,
        eventName: savedRegistration.eventName,
        numberOfMembers: savedRegistration.numberOfMembers,
        tokens,
      });

      setEditingRegistration(null);
      setGeneratedTokens(tokens);
      setShowSuccess(true);
    } catch (error) {
      console.error("Error registering for event:", error);
      setAuthError(error instanceof Error ? error.message : "Error registering for event. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="mb-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-3xl font-bold">Event Registration</h1>
              {identityUser && (
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-gray-600">{identityUser.email}</span>
                  <button type="button" onClick={signOutPublicUser} className="text-indigo-700 hover:underline">Sign out</button>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            {showSuccess ? (
              <div className="text-center py-8">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Registration Successful!</h2>
                <p className="text-gray-600 mb-6">Your tokens have been generated:</p>
                <div className="bg-gray-50 p-4 rounded-lg mb-6 text-left">
                  {generatedTokens.map((token, idx) => (
                    <div key={idx} className="font-mono text-lg font-medium text-indigo-600">{token}</div>
                  ))}
                </div>
                <p className="text-sm text-gray-500 mb-6">PDF has been downloaded. Please save the token numbers for entry.</p>
                <button
                  onClick={() => {
                    setShowSuccess(false);
                    setUserType("");
                    setMemberId("");
                    setMemberSearch("");
                    setName("");
                    setMobileNumber("");
                    setEventName("");
                    setNumberOfMembers(1);
                    setMemberValidated(false);
                    setMemberData(null);
                    setGeneratedTokens([]);
                    setErrors({});
                  }}
                  className="bg-indigo-600 text-white px-6 py-3 rounded-md hover:bg-indigo-700"
                >
                  Register Another
                </button>
              </div>
            ) : !authReady ? (
              <p className="py-8 text-center text-gray-500">Checking sign-in...</p>
            ) : !identityUser ? (
              <section className="mx-auto max-w-md space-y-5 py-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Sign in to continue</h2>
                  <p className="mt-1 text-sm text-gray-600">Use an email sign-in link or your Google account. Your email does not need to be listed on your membership.</p>
                </div>
                <div>
                  <label htmlFor="event-registration-email" className="block text-sm font-medium text-gray-700">Email address</label>
                  <input
                    id="event-registration-email"
                    type="email"
                    autoComplete="email"
                    value={emailAddress}
                    onChange={(event) => setEmailAddress(event.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="you@example.com"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => emailLinkNeedsAddress ? void completeEmailLinkSignIn(getPublicAuth(), emailAddress) : void sendEmailSignInLink()}
                  disabled={authBusy}
                  className="w-full rounded-md bg-indigo-600 px-4 py-2.5 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {authBusy ? "Please wait..." : emailLinkNeedsAddress ? "Complete email sign-in" : "Email me a sign-in link"}
                </button>
                {emailLinkSent && <p className="text-sm text-green-700">Check your inbox and open the sign-in link on this device.</p>}
                {emailLinkNeedsAddress && <p className="text-sm text-gray-600">Enter the same email address the sign-in link was sent to.</p>}
                <div className="flex items-center gap-3 text-xs uppercase text-gray-400"><span className="h-px flex-1 bg-gray-200" />or<span className="h-px flex-1 bg-gray-200" /></div>
                <button
                  type="button"
                  onClick={signInWithGoogle}
                  disabled={authBusy}
                  className="w-full rounded-md border border-gray-300 bg-white px-4 py-2.5 font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                >
                  Continue with Google
                </button>
                {authError && <p role="alert" className="text-sm text-red-600">{authError}</p>}
              </section>
            ) : !identityIdToken ? (
              <p className="py-8 text-center text-gray-500">Preparing your secure session...</p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* User Type Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Are you a member?</label>
                  <div className="flex gap-4">
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="radio"
                        name="userType"
                        value="member"
                        checked={userType === "member"}
                        disabled={Boolean(editingRegistration)}
                        onChange={() => {
                          setUserType("member");
                          resetRegistrationLookup();
                          setErrors({});
                          setMemberId("");
                          setMemberSearch("");
                          setName("");
                          setMobileNumber("");
                          setMemberValidated(false);
                          setMemberData(null);
                        }}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="ml-2 text-gray-700">Member</span>
                    </label>
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="radio"
                        name="userType"
                        value="non-member"
                        checked={userType === "non-member"}
                        disabled={Boolean(editingRegistration)}
                        onChange={() => {
                          setUserType("non-member");
                          resetRegistrationLookup();
                          setErrors({});
                          setMemberId("");
                          setMemberSearch("");
                          setName("");
                          setMobileNumber("");
                          setMemberValidated(false);
                          setMemberData(null);
                        }}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="ml-2 text-gray-700">Non-Member</span>
                    </label>
                  </div>
                  {errors.userType && <p className="mt-1 text-sm text-red-500">{errors.userType}</p>}
                </div>

                {/* Member Details - Only for Members */}
                {userType === "member" && (
                  <div className="space-y-4 border-t pt-6">
                    <h3 className="text-lg font-semibold text-gray-800">Member Verification</h3>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Member ID <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        list="paid-member-options"
                        value={memberSearch}
                        onChange={(e) => {
                          const searchValue = e.target.value;
                          const selectedMember = paidMembers.find(
                            (member) => member.memberId.trim().toLowerCase() === searchValue.trim().toLowerCase()
                          );
                          setMemberSearch(searchValue);
                          setMemberId(selectedMember?.memberId || "");
                          setName(selectedMember?.name || "");
                          setMemberData(selectedMember || null);
                          setMemberValidated(false);
                          resetRegistrationLookup();
                          setErrors({ ...errors, memberId: "", name: "" });
                        }}
                        disabled={Boolean(editingRegistration) || membersLoading || paidMembers.length === 0}
                        placeholder={membersLoading ? "Loading paid members..." : "Type a member ID to filter"}
                        autoComplete="off"
                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 ${errors.memberId ? "border-red-500" : "border-gray-300"}`}
                      />
                      <datalist id="paid-member-options">
                        {paidMembers.map((member) => (
                          <option key={member.memberId} value={member.memberId} label={member.name} />
                        ))}
                      </datalist>
                      {errors.memberId && <p className="mt-1 text-sm text-red-500">{errors.memberId}</p>}
                      <p className="mt-1 text-xs text-gray-500">Type a member ID to filter suggestions, or select a suggestion. Existing registrations are searched automatically.</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                      <input
                        type="text"
                        value={name}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-700"
                      />
                      {membersError && <p className="mt-1 text-sm text-red-500">{membersError}</p>}
                    </div>
                    {memberValidated && <p className="text-sm text-green-600">✓ Paid member selected</p>}
                  </div>
                )}

                {userType === "non-member" && (
                  <div className="space-y-4 border-t pt-6">
                    <h3 className="text-lg font-semibold text-gray-800">Non-Member Details</h3>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Number <span className="text-red-500">*</span></label>
                      <input
                        type="tel"
                        value={mobileNumber}
                        onChange={(e) => {
                          setMobileNumber(e.target.value);
                          resetRegistrationLookup();
                          setErrors({ ...errors, mobileNumber: "" });
                        }}
                        readOnly={Boolean(editingRegistration)}
                        required
                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 ${errors.mobileNumber ? "border-red-500" : "border-gray-300"}`}
                        placeholder="Enter mobile number"
                      />
                      {errors.mobileNumber && <p className="mt-1 text-sm text-red-500">{errors.mobileNumber}</p>}
                      <p className="mt-1 text-xs text-gray-500">Existing registrations are searched automatically once you enter a complete mobile number.</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value);
                          setErrors({ ...errors, name: "" });
                        }}
                        required
                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 ${errors.name ? "border-red-500" : "border-gray-300"}`}
                        placeholder="Enter full name"
                      />
                      {errors.name && <p className="mt-1 text-sm text-red-500">{errors.name}</p>}
                    </div>
                  </div>
                )}

                {hasRegistrationLookup && (registrationsLoading || lookupComplete) && (
                  <section className="border-t pt-5" aria-live="polite">
                    <h3 className="text-lg font-semibold text-gray-800">Existing Registrations</h3>
                    {registrationsLoading ? (
                      <p className="mt-2 text-sm text-gray-500">Searching registrations...</p>
                    ) : (
                      <>
                        {tokenQueueStats && (
                          <div className="mt-3 rounded-md bg-indigo-50 p-4">
                            {!tokenQueueStats.hasAnyCompletedToken ? (
                              <p className="font-medium text-indigo-900">Event not yet started. You are first in line</p>
                            ) : tokenQueueStats.hasCompletedTokenAfterSelection ? (
                              <p className="font-medium text-indigo-900">Your token has passed. Contact the club helpdesk for further instructions</p>
                            ) : (
                              <>
                                <h4 className="font-medium text-indigo-900">
                                  {userType === "member" ? "Member token progress" : "Non-member token progress"}
                                </h4>
                                <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                              <div>
                                <dt className="text-indigo-700">
                                  Completed person tokens through {tokenQueueStats.isRegistered ? "this registration" : "the current position"}
                                </dt>
                                <dd className="mt-1 font-semibold text-indigo-950">{tokenQueueStats.completedTokenCount}</dd>
                              </div>
                              {tokenQueueStats.isRegistered ? (
                                <>
                                  <div>
                                    <dt className="text-indigo-700">Completed tokens in this registration</dt>
                                    <dd className="mt-1 font-semibold text-indigo-950">{tokenQueueStats.selectedCompletedTokenCount}</dd>
                                  </div>
                                  <div>
                                    <dt className="text-indigo-700">Pending person tokens before this registration</dt>
                                    <dd className="mt-1 font-semibold text-indigo-950">{tokenQueueStats.pendingTokensBefore}</dd>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div>
                                    <dt className="text-indigo-700">Currently registered person tokens</dt>
                                    <dd className="mt-1 font-semibold text-indigo-950">{tokenQueueStats.totalRegisteredTokens}</dd>
                                  </div>
                                  <div>
                                    <dt className="text-indigo-700">Pending person tokens before the next registration</dt>
                                    <dd className="mt-1 font-semibold text-indigo-950">{tokenQueueStats.pendingTokensBefore}</dd>
                                  </div>
                                  <div>
                                    <dt className="text-indigo-700">Next token position</dt>
                                    <dd className="mt-1 font-semibold text-indigo-950">{tokenQueueStats.totalRegisteredTokens + 1}</dd>
                                  </div>
                                </>
                              )}
                                </dl>
                              </>
                            )}
                          </div>
                        )}
                        {matchingRegistrations.length === 0 ? (
                          <p className="mt-2 text-sm text-gray-500">No existing registrations found.</p>
                        ) : (
                          <div className="mt-3 space-y-3">
                            {matchingRegistrations.map((registration) => (
                              <div key={registration.key} className="rounded-md border border-gray-200 p-4">
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                  <dl className="grid min-w-0 flex-1 grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                                    <div>
                                      <dt className="text-xs font-medium uppercase text-gray-500">Participant Type</dt>
                                      <dd className="mt-1 text-sm text-gray-900">{registration.userType === "member" ? "Member" : "Non-Member"}</dd>
                                    </div>
                                    {registration.memberId && (
                                      <div>
                                        <dt className="text-xs font-medium uppercase text-gray-500">Member ID</dt>
                                        <dd className="mt-1 text-sm text-gray-900">{registration.memberId}</dd>
                                      </div>
                                    )}
                                    <div>
                                      <dt className="text-xs font-medium uppercase text-gray-500">Name</dt>
                                      <dd className="mt-1 text-sm text-gray-900">{registration.name || "-"}</dd>
                                    </div>
                                    {registration.mobileNumber && (
                                      <div>
                                        <dt className="text-xs font-medium uppercase text-gray-500">Mobile Number</dt>
                                        <dd className="mt-1 text-sm text-gray-900">{registration.mobileNumber}</dd>
                                      </div>
                                    )}
                                    <div>
                                      <dt className="text-xs font-medium uppercase text-gray-500">Event</dt>
                                      <dd className="mt-1 text-sm text-gray-900">{registration.eventName}</dd>
                                    </div>
                                    <div>
                                      <dt className="text-xs font-medium uppercase text-gray-500">Number of Members</dt>
                                      <dd className="mt-1 text-sm text-gray-900">{registration.numberOfMembers}</dd>
                                    </div>
                                    <div>
                                      <dt className="text-xs font-medium uppercase text-gray-500">Registration Date</dt>
                                      <dd className="mt-1 text-sm text-gray-900">{registration.date}</dd>
                                    </div>
                                    <div className="sm:col-span-2">
                                      <dt className="text-xs font-medium uppercase text-gray-500">Token Numbers</dt>
                                      <dd className="mt-1 break-words font-mono text-sm text-gray-900">{registration.tokens?.join(", ") || "-"}</dd>
                                    </div>
                                  </dl>
                                  <div className="flex shrink-0 gap-2">
                                    <button
                                      type="button"
                                      onClick={() => startEditingRegistration(registration)}
                                      className="rounded border border-indigo-300 px-3 py-1.5 text-sm text-indigo-700 hover:bg-indigo-50"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => deleteRegistration(registration)}
                                      className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </section>
                )}

                {authError && <p role="alert" className="text-sm text-red-600">{authError}</p>}

                {canShowRegistrationControls && <>
                {/* Event Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Event Name <span className="text-red-500">*</span></label>
                  <select
                    value={eventName}
                    onChange={(e) => { setEventName(e.target.value); setErrors({ ...errors, eventName: "" }); }}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 ${errors.eventName ? "border-red-500" : "border-gray-300"}`}
                  >
                    <option value="">-- Select Event --</option>
                    {EVENTS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                  </select>
                  {errors.eventName && <p className="mt-1 text-sm text-red-500">{errors.eventName}</p>}
                </div>

                {/* Number of Members */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Number of Members <span className="text-red-500">*</span></label>
                  <select
                    value={numberOfMembers}
                    onChange={(e) => { setNumberOfMembers(parseInt(e.target.value)); setErrors({ ...errors, numberOfMembers: "" }); }}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 ${errors.numberOfMembers ? "border-red-500" : "border-gray-300"}`}
                  >
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  {errors.numberOfMembers && <p className="mt-1 text-sm text-red-500">{errors.numberOfMembers}</p>}
                </div>
                </>}

                {/* Submit */}
                {canShowRegistrationControls && editingRegistration && (
                  <div className="flex items-center justify-between rounded-md bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
                    <span>Editing existing registration</span>
                    <button type="button" onClick={cancelEditingRegistration} className="font-medium underline">Cancel</button>
                  </div>
                )}
                {canShowRegistrationControls && <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-indigo-600 text-white py-3 px-4 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {submitting ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Registering...
                    </>
                  ) : (
                    editingRegistration ? "Update Registration" : "Register for Event"
                  )}
                </button>}
              </form>
            )}
          </div>
        </div>
    </div>
  );
}