
import { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { onAuthStateChanged, signOut } from "firebase/auth";
import Main from "./components/create.js";
import ChatInterface from "./components/ChatInterface.js";
import { auth } from "./components/firebase.js";

function App() {
	const [user, setUser] = useState(null);
	const [isGuest, setIsGuest] = useState(false);
	const [route, setRoute] = useState(window.location.pathname);
	const [authReady, setAuthReady] = useState(false);

	useEffect(() => {
		const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
			setUser(currentUser);
			if (currentUser) setIsGuest(false);
			setAuthReady(true);
		});

		const handlePopState = () => setRoute(window.location.pathname);
		window.addEventListener("popstate", handlePopState);

		return () => {
			unsubscribe();
			window.removeEventListener("popstate", handlePopState);
		};
	}, []);

	useEffect(() => {
		if (!authReady) return;

		const destination = user || isGuest ? "/chat" : "/";
		if (route !== destination) {
			window.history.replaceState(null, "", destination);
			setRoute(destination);
		}
	}, [authReady, isGuest, route, user]);

	if (!authReady) {
		return <main className="min-h-screen grid place-items-center">Loading...</main>;
	}

	if (user || isGuest) {
		return (
			<ChatInterface
				user={user}
				isGuest={isGuest}
				onSignOut={() => signOut(auth)}
				onSignIn={() => {
					setIsGuest(false);
					window.history.replaceState(null, "", "/");
					setRoute("/");
				}}
			/>
		);
	}

	return (
		<Main
			onGuestLogin={() => {
				setIsGuest(true);
				window.history.replaceState(null, "", "/chat");
				setRoute("/chat");
			}}
		/>
	);
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
