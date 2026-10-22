import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";

const API_URL = (process.env.API_URL || "http://localhost:3003/api").replace(/\/$/, "");
const MAX_CONTEXT_MESSAGES = 8;
const MAX_CONTEXT_MESSAGE_LENGTH = 3000;
const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins = [rehypeKatex];

async function apiRequest(user, path, options = {}) {
  const token = await user.getIdToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  const responseText = await response.text();
  let result = {};
  if (responseText) {
    try {
      result = JSON.parse(responseText);
    } catch {
      throw new Error(`The API returned an unreadable response (${response.status}).`);
    }
  }

  if (!response.ok) {
    throw new Error(result.error || "The chat API request failed.");
  }

  return result;
}

async function streamRequest(user, path, options, onText, signal) {
  const token = user ? await user.getIdToken() : null;
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    signal,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const responseText = await response.text();
    let result = {};
    try {
      result = responseText ? JSON.parse(responseText) : {};
    } catch {
      throw new Error(`The API returned an unreadable response (${response.status}).`);
    }
    throw new Error(result.error || "The chat API request failed.");
  }

  if (!response.body) throw new Error("This browser cannot read a streamed response.");
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    throw new Error("The API did not return a streamed response.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = null;

  const processEvent = (eventText) => {
    const data = eventText
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) return;

    let event;
    try {
      event = JSON.parse(data);
    } catch {
      throw new Error("The API sent an unreadable stream event.");
    }
    if (event.error) throw new Error(event.error);
    if (event.text) onText(event.text);
    if (event.chat || event.answer !== undefined) result = event;
  };

  let streamCompleted = false;
  try {
    let done = false;
    while (!done) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      let boundary;
      while ((boundary = buffer.match(/\r?\n\r?\n/))) {
        const eventEnd = boundary.index;
        processEvent(buffer.slice(0, eventEnd));
        buffer = buffer.slice(eventEnd + boundary[0].length);
      }
      done = chunk.done;
    }
    if (buffer.trim()) processEvent(buffer);
    if (!result || (!result.chat && typeof result.answer !== "string")) {
      throw new Error("The response stream ended before completion.");
    }
    streamCompleted = true;
  } finally {
    if (!streamCompleted) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }

  return result;
}

const suggestions = [
  "Explain binary search",
  "How do I detect a cycle in a linked list?",
  "When should I use a hash map?",
  "Help me understand dynamic programming",
];

export default function ChatInterface({ user, isGuest = false, onSignOut, onSignIn }) {
  const [prompt, setPrompt] = useState("");
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [deletingChatId, setDeletingChatId] = useState(null);
  const [streamingMessageId, setStreamingMessageId] = useState(null);
  const messagesEndRef = useRef(null);
  const streamAbortRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [messages]);

  useEffect(() => () => streamAbortRef.current?.abort(), []);

  useEffect(() => {
    let cancelled = false;

    if (isGuest) {
      setChats([]);
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    apiRequest(user, "/chats")
      .then(({ chats: savedChats }) => {
        if (!cancelled) setChats(savedChats);
      })
      .catch((error) => {
        if (!cancelled) setStatus(`Could not load chat history: ${error.message}`);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isGuest, user]);

  const startChat = async (event) => {
    event.preventDefault();
    const question = prompt.trim();
    if (!question || isSending) return;

    setIsSending(true);
    setStatus("");
    const messageId = Date.now();
    const userMessageId = `${messageId}-user`;
    const assistantMessageId = `${messageId}-assistant`;
    const appendPendingMessages = () => {
      setStreamingMessageId(assistantMessageId);
      setMessages((currentMessages) => [
        ...currentMessages,
        { _id: userMessageId, role: "user", content: question },
        { _id: assistantMessageId, role: "assistant", content: "", isComplete: false },
      ]);
    };
    const appendText = (text) => {
      setMessages((currentMessages) => currentMessages.map((message) => (
        message._id === assistantMessageId
          ? { ...message, content: message.content + text }
          : message
      )));
    };
    const controller = new AbortController();
    streamAbortRef.current = controller;

    try {
      if (isGuest) {
        const priorContext = messages
          .slice(-MAX_CONTEXT_MESSAGES)
          .map((message) => `${message.role === "assistant" ? "Instructor" : "Student"}: ${message.content.slice(0, MAX_CONTEXT_MESSAGE_LENGTH)}`)
          .join("\n\n");
        const input = priorContext ? `${priorContext}\n\nStudent: ${question}` : question;
        appendPendingMessages();
        setPrompt("");
        const { answer } = await streamRequest(
          null,
          "/guest/message",
          { method: "POST", body: JSON.stringify({ input }) },
          appendText,
          controller.signal
        );
        setMessages((currentMessages) => currentMessages.map((message) => (
          message._id === assistantMessageId
            ? { ...message, content: answer, isComplete: true }
            : message
        )));
        setStreamingMessageId(null);
        return;
      }

      let chatId = activeChatId;
      if (!chatId) {
        const { chat } = await apiRequest(user, "/chats", {
          method: "POST",
          body: JSON.stringify({}),
        });
        chatId = chat._id;
        setActiveChatId(chatId);
        setChats((currentChats) => [chat, ...currentChats]);
      }

      appendPendingMessages();
      setPrompt("");
      const { chat } = await streamRequest(
        user,
        `/chats/${chatId}/messages`,
        { method: "POST", body: JSON.stringify({ content: question }) },
        appendText,
        controller.signal
      );

      setMessages(chat.messages.map((message) => ({ ...message, isComplete: true })));
      setStreamingMessageId(null);
      setChats((currentChats) => [
        chat,
        ...currentChats.filter((existingChat) => existingChat._id !== chat._id),
      ]);
    } catch (error) {
      setStatus(controller.signal.aborted
        ? "Response stopped. The partial answer was not saved."
        : `${isGuest ? "Could not finish your answer" : "Could not save your message"}: ${error.message}`);
      setStreamingMessageId(null);
      setMessages((currentMessages) => currentMessages.flatMap((message) => {
        if (message._id !== assistantMessageId) return [message];
        return message.content
          ? [{ ...message, isComplete: false, interrupted: true }]
          : [];
      }));
    } finally {
      if (streamAbortRef.current === controller) streamAbortRef.current = null;
      setIsSending(false);
    }
  };

  const newChat = () => {
    if (isSending) return;
    setActiveChatId(null);
    setMessages([]);
    setStreamingMessageId(null);
    setPrompt("");
    setStatus("");
  };

  const openChat = async (chatId) => {
    if (isSending) return;
    setIsLoading(true);
    setStatus("");
    try {
      const { chat } = await apiRequest(user, `/chats/${chatId}`);
      setActiveChatId(chat._id);
      setMessages(chat.messages);
    } catch (error) {
      setStatus(`Could not open this chat: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteChat = async (chat) => {
    const confirmed = window.confirm(`Delete "${chat.title}" and all its messages?`);
    if (!confirmed) return;

    setDeletingChatId(chat._id);
    setStatus("");
    try {
      await apiRequest(user, `/chats/${chat._id}`, { method: "DELETE" });
      setChats((currentChats) => currentChats.filter((item) => item._id !== chat._id));
      if (activeChatId === chat._id) {
        setActiveChatId(null);
        setMessages([]);
      }
      setStatus("Chat deleted.");
    } catch (error) {
      setStatus(`Could not delete chat: ${error.message}`);
    } finally {
      setDeletingChatId(null);
    }
  };

  return (
    <main className="min-h-screen bg-[#f5f6f2] text-[#18231f] md:flex">
      <aside className="flex w-full flex-col bg-[#182d27] p-5 text-white md:sticky md:top-0 md:h-screen md:self-start md:overflow-y-auto md:w-64">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-md bg-[#b8d37a] font-bold text-[#182d27]">D</span>
          <span className="font-semibold">DSA Studio</span>
        </div>
        <button
          className="w-full rounded-md bg-[#b8d37a] px-4 py-3 text-left font-semibold text-[#182d27] hover:bg-[#c7df8c] disabled:opacity-50"
          disabled={isSending}
          onClick={newChat}
          type="button"
        >
          + New chat
        </button>
        <p className="mt-8 text-xs font-semibold uppercase text-[#b9c8c0]">{isGuest ? "Temporary session" : "Recent chats"}</p>
        <nav className="mt-3 grid gap-1" aria-label="Saved chats">
          {isGuest && <p className="px-3 py-2 text-xs leading-5 text-[#d5ded9]">Messages stay in this tab and are not saved.</p>}
          {!isGuest && isLoading && <p className="text-sm text-[#d5ded9]">Loading chats...</p>}
          {!isGuest && !isLoading && chats.length === 0 && (
            <p className="text-sm text-[#d5ded9]">No saved chats yet</p>
          )}
          {!isGuest && chats.map((chat) => (
            <div className="flex min-w-0 items-center gap-1" key={chat._id}>
              <button
                className={`min-w-0 flex-1 truncate rounded-md px-3 py-2 text-left text-sm hover:bg-white/10 ${activeChatId === chat._id ? "bg-white/10" : ""}`}
                disabled={isSending}
                onClick={() => openChat(chat._id)}
                type="button"
              >
                {chat.title}
              </button>
              <button
                aria-label={`Delete ${chat.title}`}
                className="shrink-0 rounded px-2 py-2 text-xs text-[#f0b3a5] hover:bg-white/10 disabled:opacity-50"
                disabled={deletingChatId === chat._id || isSending}
                onClick={() => deleteChat(chat)}
                title="Delete chat"
                type="button"
              >
                {deletingChatId === chat._id ? "..." : "Delete"}
              </button>
            </div>
          ))}
        </nav>
        <div className="mt-auto border-t border-white/15 pt-4">
          <p className="truncate text-sm text-[#d5ded9]">{isGuest ? "Guest session" : user?.email}</p>
          {isGuest ? (
            <button className="mt-3 text-sm text-[#b8d37a] underline underline-offset-4" onClick={onSignIn} type="button">Sign in for saved chats</button>
          ) : (
            <button className="mt-3 text-sm text-[#b8d37a] underline underline-offset-4" onClick={onSignOut} type="button">Sign out</button>
          )}
        </div>
      </aside>

      <section className="flex min-h-[calc(100vh-16rem)] flex-1 flex-col px-5 py-8 md:min-h-screen md:px-12 md:py-10">
        <header className="flex items-center justify-between border-b border-[#dfe4dc] pb-5">
          <div>
            <p className="text-sm text-[#64736b]">Your DSA workspace</p>
            <h1 className="mt-1 text-lg font-semibold">Problem-solving chat</h1>
          </div>
          <span className="rounded-full border border-[#d4ded0] px-3 py-1 text-xs text-[#466047]">{isGuest ? "Temporary · DSA only" : "DSA only"}</span>
        </header>

        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-5 py-10">
          {messages.length > 0 ? (
            messages.map((message) => (
              <div
                className={`max-w-[85%] rounded-lg px-4 py-3 md:max-w-[70%] ${message.role === "user" ? "ml-auto whitespace-pre-wrap bg-[#e3eadb]" : "chat-markdown border border-[#dfe4dc] bg-white"}`}
                key={message._id}
              >
                {message.role === "assistant" ? (
                  <>
                    {message.content ? (
                      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>
                        {message.content}
                      </ReactMarkdown>
                    ) : streamingMessageId === message._id ? (
                      <span className="text-sm text-[#64736b]" role="status">Thinking...</span>
                    ) : null}
                    {streamingMessageId === message._id && message.content && (
                      <span className="streaming-cursor" aria-hidden="true" />
                    )}
                  </>
                ) : message.content}
              </div>
            ))
          ) : (
            <>
              <p className="text-sm font-medium text-[#6c8059]">Welcome{user?.displayName ? `, ${user.displayName}` : isGuest ? ", guest" : ""}</p>
              <h2 className="mt-3 max-w-xl text-3xl font-semibold leading-tight md:text-4xl">
                What are you working through today?
              </h2>
              <p className="mt-3 max-w-xl leading-7 text-[#64736b]">
                Start with a data structure, an algorithm, or a problem you want to reason through.
              </p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {suggestions.map((suggestion) => (
                  <button
                    className="rounded-md border border-[#dfe4dc] bg-white p-4 text-left text-sm hover:border-[#80966a] hover:bg-[#fbfcf9]"
                    key={suggestion}
                    onClick={() => setPrompt(suggestion)}
                    type="button"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form className="mx-auto w-full max-w-3xl" onSubmit={startChat}>
          <label className="sr-only" htmlFor="chat-prompt">Your DSA question</label>
          <div className="flex items-end gap-3 rounded-lg border border-[#d5ddd2] bg-white p-3 focus-within:border-[#71885e]">
            <textarea
              className="max-h-36 min-h-12 flex-1 resize-y bg-transparent p-2 outline-none placeholder:text-[#8a958d]"
              id="chat-prompt"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  if (prompt.trim() && !isSending) event.currentTarget.form?.requestSubmit();
                }
              }}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Ask a DSA question..."
              value={prompt}
            />
            {isSending ? (
              <button
                aria-label="Stop response generation"
                className="rounded-md border border-[#b86b58] px-4 py-2 text-sm font-semibold text-[#91432f] hover:bg-[#fff5f1]"
                onClick={() => streamAbortRef.current?.abort()}
                type="button"
              >
                Stop
              </button>
            ) : (
              <button
                className="rounded-md bg-[#29463a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d382d] disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!prompt.trim()}
                type="submit"
              >
                Start
              </button>
            )}
          </div>
          <p className="mt-2 text-center text-xs text-[#77847b]">{isGuest ? "Temporary chat only. Refreshing this page clears it." : "DSA-focused answers are saved with your chat."}</p>
          <p className="mt-2 text-center text-sm text-[#9a442e]" role="status" aria-live="polite">{status}</p>
        </form>
      </section>
    </main>
  );
}