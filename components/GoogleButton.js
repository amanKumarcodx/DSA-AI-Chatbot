import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "./firebase";

const googleProvider = new GoogleAuthProvider();

export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);

    const user = result.user;

    console.log(user);
    console.log(user.uid);
    console.log(user.email);
  } catch (error) {
    console.error(error);
  }
};
