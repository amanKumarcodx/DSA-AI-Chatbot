// withEmil&pass.js
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "./firebase";

export const registerUser = async (email, password) => {
  const userCredential = await createUserWithEmailAndPassword(
    auth,
    email,
    password
  );
  return userCredential.user;
};

