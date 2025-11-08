/* DOM elements */
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatWindow = document.getElementById("chatWindow");

/* Configuration — set your deployed worker URL here for secure calls.
  The Cloudflare Worker should hold the OpenAI API key as a secret.
  Set WORKER_URL to the public worker URL (example below). */
const WORKER_URL = "https://broad-frog-68ee.lthomas15.workers.dev/"; // set to your deployed worker URL

// Chat history kept in-memory for the session. We keep a system message once.
const messages = [
  { role: "system", content: "You are a helpful product advisor for L'Oréal." },
];

// Elements
const latestQuestionEl = document.getElementById("latestQuestion");

// Initial UI greeting
appendMessage("👋 Hello! How can I help you today?", "ai");

/* Helpers */
function appendMessage(text, who = "ai") {
  const wrapper = document.createElement("div");
  wrapper.className = `msg ${who === "user" ? "user" : "ai"}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  wrapper.appendChild(bubble);
  chatWindow.appendChild(wrapper);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function setLoading(isLoading) {
  if (isLoading) {
    userInput.disabled = true;
    chatForm.querySelector("button").setAttribute("aria-busy", "true");
  } else {
    userInput.disabled = false;
    chatForm.querySelector("button").removeAttribute("aria-busy");
    userInput.focus();
  }
}

/* Send messages to the Cloudflare Worker. The worker must hold the OpenAI key.
   Returns assistant text or throws on error. */
async function sendToAPI(messagesPayload) {
  if (!WORKER_URL || WORKER_URL.trim() === "") {
    throw new Error(
      "WORKER_URL is not configured. Set WORKER_URL to your deployed worker URL."
    );
  }

  const res = await fetch(WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: messagesPayload }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Worker error ${res.status}: ${txt}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? null;
}

/* Handle form submit */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = userInput.value.trim();
  if (!text) return;

  // display latest question (resets on each submit)
  latestQuestionEl.textContent = text;

  // append user message locally and add to messages payload (for history)
  appendMessage(text, "user");
  messages.push({ role: "user", content: text });

  // clear input and show loading state
  userInput.value = "";
  setLoading(true);

  // show a temporary typing indicator
  const typingEl = document.createElement("div");
  typingEl.className = "msg ai";
  typingEl.textContent = "…";
  chatWindow.appendChild(typingEl);
  chatWindow.scrollTop = chatWindow.scrollHeight;

  try {
    const assistantText = await sendToAPI(messages);
    // remove typing indicator
    typingEl.remove();

    if (!assistantText) {
      appendMessage("Sorry, I didn't get a reply.", "ai");
      setLoading(false);
      return;
    }

    // append assistant message and add to history
    appendMessage(assistantText, "ai");
    messages.push({ role: "assistant", content: assistantText });
  } catch (err) {
    console.error(err);
    typingEl.remove();
    appendMessage(
      "There was an error getting a response. Try again later.",
      "ai"
    );
  } finally {
    setLoading(false);
  }
});
