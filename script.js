/* DOM elements */
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatWindow = document.getElementById("chatWindow");

/* Configuration — set your deployed worker URL here for secure calls.
  The Cloudflare Worker should hold the OpenAI API key as a secret.
  Set WORKER_URL to the public worker URL (example below). */
const WORKER_URL = "https://broad-frog-68ee.lthomas15.workers.dev/"; // set to your deployed worker URL

// session and conversation history
const BASE_SYSTEM = "You are a helpful product advisor for L'Oréal.";
const MAX_HISTORY = 10; // keep last N user/assistant turns (not counting system)
let session = { userName: null };

// Chat history kept in-memory for the session. Keep the system message at index 0.
let messages = [{ role: "system", content: BASE_SYSTEM }];

// Elements
const latestQuestionEl = document.getElementById("latestQuestion");

// Initial UI greeting
appendMessage("👋 Hello! How can I help you today?", "ai");

/* Helpers */
function appendMessage(text, who = "ai", opts = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = `msg ${who === "user" ? "user" : "ai"}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";

  // if the message is from the user and we know the name, show it small above the bubble
  if (who === "user" && opts.name) {
    const nameLabel = document.createElement("div");
    nameLabel.className = "msg-label";
    nameLabel.style.fontSize = "12px";
    nameLabel.style.marginBottom = "6px";
    nameLabel.style.opacity = "0.85";
    nameLabel.textContent = opts.name;
    wrapper.appendChild(nameLabel);
  }

  bubble.textContent = text;
  wrapper.appendChild(bubble);
  chatWindow.appendChild(wrapper);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

/* Add a message to the in-memory history and trim if necessary */
function addMessageToHistory(role, content) {
  messages.push({ role, content });
  // maintain system message as first element, trim the rest to MAX_HISTORY
  const system = messages[0];
  const rest = messages.slice(1);
  while (rest.length > MAX_HISTORY) {
    rest.shift();
  }
  messages = [system, ...rest];
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

  // helpful debug log so we can verify the client is calling the worker
  console.debug("Sending messages to worker:", WORKER_URL, messagesPayload);

  const res = await fetch(WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Include a small client-side marker header for worker-side logging/inspection
    // (worker can ignore if not needed)
    // Note: don't put secrets in the client.
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
  appendMessage(text, "user", { name: session.userName || "" });
  addMessageToHistory("user", text);

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
    addMessageToHistory("assistant", assistantText);
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

/* Name form handling: allow user to optionally set a name for the session. */
const nameForm = document.getElementById("nameForm");
const userNameInput = document.getElementById("userNameInput");
if (nameForm) {
  nameForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const val = userNameInput.value.trim();
    session.userName = val || null;

    // update the system message so the assistant is aware of the user's name
    messages[0].content =
      BASE_SYSTEM +
      (session.userName ? ` The user's name is ${session.userName}.` : "");

    // give feedback in the chat window
    appendMessage(
      session.userName
        ? `Nice to meet you, ${session.userName}! I'll remember your name for this session.`
        : `Okay — I'll not use a name for this session.`,
      "ai"
    );
  });
}
