import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "./firebase";

export const loginUser = async (email, password) => {
  const userCredential = await signInWithEmailAndPassword(
    auth,
    email,
    password
  );
  return userCredential.user;
};
