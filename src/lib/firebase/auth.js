import {
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  updatePassword,
} from "firebase/auth";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./client";

export async function loginWithEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const profileRef = doc(db, "users", cred.user.uid);
  const profileSnap = await getDoc(profileRef);

  if (!profileSnap.exists()) {
    await signOut(auth);
    throw new Error("No employee profile found for this account. Contact admin.");
  }

  const profile = profileSnap.data();

  if (profile.status !== "active") {
    await signOut(auth);
    throw new Error(`Your account is ${profile.status}. Contact admin.`);
  }

  await updateDoc(profileRef, { lastLoginAt: serverTimestamp() });

  return { uid: cred.user.uid, ...profile };
}

export async function logout() {
  await signOut(auth);
}

export async function requestPasswordReset(email) {
  await sendPasswordResetEmail(auth, email);
}

export async function changePassword(newPassword) {
  if (!auth.currentUser) throw new Error("Not authenticated.");
  await updatePassword(auth.currentUser, newPassword);
  const profileRef = doc(db, "users", auth.currentUser.uid);
  await updateDoc(profileRef, { forcePasswordChange: false });
}

export function subscribeToAuthState(callback) {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser) {
      callback(null);
      return;
    }
    const profileRef = doc(db, "users", firebaseUser.uid);
    const profileSnap = await getDoc(profileRef);
    if (!profileSnap.exists()) {
      callback(null);
      return;
    }
    callback({ uid: firebaseUser.uid, ...profileSnap.data() });
  });
}