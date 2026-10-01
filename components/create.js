import {loginWithGoogle} from "./GoogleButton"
import {registerUser} from "./withEmil&pass"
import { useState } from "react";
import LoginInterface from "./loginInter";
export default function Main({ onGuestLogin }) {

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
    const [registrationMessage, setRegistrationMessage] = useState("");
    const [isRegistering, setIsRegistering] = useState(false);
    const [showLogin, setShowLogin] = useState(false);

    const handleRegister = async () => {
        setIsRegistering(true);
        setRegistrationMessage("");

        try {
            const user = await registerUser(email.trim(), password);
            setRegistrationMessage(`Account created for ${user.email}.`);
        } catch (error) {
            setRegistrationMessage(
                `Registration failed (${error.code ?? "unknown"}): ${error.message}`
            );
        } finally {
            setIsRegistering(false);
        }
    };

    if (showLogin) {
        return <LoginInterface onCreateAccount={() => setShowLogin(false)} onGuestLogin={onGuestLogin} />;
    }

    return (
        <main className="min-h-screen bg-[#f3f5ef] text-[#1b2923] md:grid md:grid-cols-[minmax(300px,0.85fr)_1.15fr]">
            <aside className="relative flex min-h-[210px] flex-col justify-between overflow-hidden bg-[#203a2e] px-7 py-7 text-white sm:px-10 md:min-h-screen md:px-12 md:py-10">
                <div className="pointer-events-none absolute inset-0 opacity-[0.12]" style={{ backgroundImage: "linear-gradient(rgba(219,235,209,.25) 1px, transparent 1px), linear-gradient(90deg, rgba(219,235,209,.25) 1px, transparent 1px)", backgroundSize: "34px 34px" }} />
                <div className="relative flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-xl bg-[#c5df83] text-[#17382b]"><span className="font-mono text-lg font-bold">&#123; &#125;</span></span>
                    <div>
                        <p className="font-[Space_Grotesk] text-sm font-bold tracking-wide">DSA Studio</p>
                        <p className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-[#bdcfc1]">Problem solving</p>
                    </div>
                </div>
                <div className="relative mt-10 max-w-md md:mb-20">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#c5df83]">Think in steps</p>
                    <h2 className="mt-4 font-[Space_Grotesk] text-3xl font-semibold leading-tight sm:text-4xl">Build your algorithmic thinking.</h2>
                    <p className="mt-4 max-w-sm text-sm leading-6 text-[#c5d2c8]">A focused place to work through data structures, algorithms, and the reasoning behind them.</p>
                    <div className="mt-8 hidden items-center gap-2 font-mono text-xs text-[#c5df83] md:flex"><span className="h-px w-8 bg-[#c5df83]" /> arrays · trees · graphs</div>
                </div>
                <p className="relative mt-8 text-[10px] uppercase tracking-[0.15em] text-[#9db1a3]">A quieter way to solve harder problems</p>
            </aside>

            <section className="flex items-center justify-center px-6 py-10 sm:px-10 md:px-12">
                <div className="w-full max-w-[420px]">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#718466]">Create your account</p>
                    <h1 className="mt-3 font-[Space_Grotesk] text-3xl font-semibold tracking-tight text-[#20372b]">Start learning with clarity.</h1>
                    <p className="mt-2 text-sm leading-6 text-[#738076]">Save your DSA conversations and pick up where you left off.</p>

                    <button className="mt-5 flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-[#d9e1d5] bg-white text-sm font-semibold text-[#34453a] transition hover:border-[#b6c6aa] hover:bg-[#fbfcf9]" onClick={loginWithGoogle} type="button">
                        <span className="grid size-5 place-items-center rounded-full border border-[#dce4d8] text-[11px] font-bold text-[#54724d]">G</span>
                        Continue with Google
                    </button>

                    <div className="my-6 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9aa59b]"><span className="h-px flex-1 bg-[#dfe5dc]" />or use email<span className="h-px flex-1 bg-[#dfe5dc]" /></div>

                    <div className="space-y-4">
                        <div>
                            <label className="mb-1.5 block text-xs font-semibold text-[#46564a]" htmlFor="create-email">Email address</label>
                            <input className="h-11 w-full rounded-lg border border-[#d9e1d5] bg-white px-3.5 text-sm text-[#25372b] outline-none transition placeholder:text-[#a0aaa1] focus:border-[#819b6c] focus:ring-4 focus:ring-[#819b6c]/10" id="create-email" type="email" autoComplete="email" value={email} required placeholder="you@example.com" onChange={(event) => setEmail(event.target.value)} />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-xs font-semibold text-[#46564a]" htmlFor="create-password">Password</label>
                            <input className="h-11 w-full rounded-lg border border-[#d9e1d5] bg-white px-3.5 text-sm text-[#25372b] outline-none transition placeholder:text-[#a0aaa1] focus:border-[#819b6c] focus:ring-4 focus:ring-[#819b6c]/10" id="create-password" type="password" autoComplete="new-password" value={password} required minLength={6} placeholder="At least 6 characters" onChange={(event) => setPassword(event.target.value)} />
                        </div>
                    </div>

                    <label className="mt-4 flex items-start gap-2.5 text-xs leading-5 text-[#77847a]">
                        <input className="mt-1 accent-[#496b43]" type="checkbox" required />
                        <span>By signing up, you agree to the <span className="font-semibold text-[#405741]">Terms &amp; Conditions</span> and <span className="font-semibold text-[#405741]">Privacy Policy</span>.</span>
                    </label>

                    <button className="mt-4 flex h-11 w-full items-center justify-center rounded-lg bg-[#294a37] px-4 text-sm font-semibold text-white shadow-[0_5px_14px_rgba(41,74,55,.16)] transition hover:bg-[#1d3d2c] disabled:cursor-wait disabled:opacity-65" onClick={handleRegister} disabled={isRegistering} type="button">
                        {isRegistering ? "Creating account..." : "Create account"}
                    </button>
                    <p className=" min-h-5 text-xs text-[#9a4d3d]" role="status" aria-live="polite">{registrationMessage}</p>

                    <p className=" text-center text-sm text-[#78847a]">Already have an account? <button className="font-semibold text-[#3d6241] underline decoration-[#b4c6a7] underline-offset-4 hover:text-[#203a2e]" onClick={() => setShowLogin(true)} type="button">Log in</button></p>

                    <div className="my-6 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9aa59b]"><span className="h-px flex-1 bg-[#dfe5dc]" />or explore first<span className="h-px flex-1 bg-[#dfe5dc]" /></div>
                    <button className="flex h-11 w-full items-center justify-center rounded-lg border border-[#d9e1d5] bg-[#eef2e9] px-4 text-sm font-semibold text-[#38523c] transition hover:border-[#b6c6aa] hover:bg-[#e7eddf]" onClick={onGuestLogin} type="button">Continue as guest</button>
                    <p className="mt-2 text-center text-[11px] leading-5 text-[#8a958b]">Guest chats are temporary and disappear when you refresh.</p>
                </div>
            </section>
        </main>
    );
}
