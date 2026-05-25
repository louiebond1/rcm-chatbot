require('dotenv').config();
const express = require('express');
const OpenAI = require('openai');

const app = express();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ASSISTANT_ID = process.env.ASSISTANT_ID;

app.use(express.json());

// In-memory thread store (keyed by session ID)
const threads = new Map();

app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RCM Assistant</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f4; height: 100dvh; display: flex; flex-direction: column; }
  header { background: #0f0f0e; padding: 16px 24px; display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
  .logo { width: 28px; height: 28px; background: #fff; border-radius: 6px; display: flex; align-items: center; justify-content: center; }
  .logo svg { width: 16px; height: 16px; }
  header h1 { color: #fff; font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }
  header span { color: #666; font-size: 13px; margin-left: auto; }
  #chat { flex: 1; overflow-y: auto; padding: 24px; display: flex; flex-direction: column; gap: 16px; }
  .msg { max-width: 720px; width: 100%; }
  .msg.user { align-self: flex-end; }
  .msg.assistant { align-self: flex-start; }
  .bubble { padding: 12px 16px; border-radius: 12px; font-size: 14px; line-height: 1.65; white-space: pre-wrap; word-wrap: break-word; }
  .msg.user .bubble { background: #0f0f0e; color: #fff; border-bottom-right-radius: 3px; }
  .msg.assistant .bubble { background: #fff; color: #1a1a1a; border: 1px solid #e8e5e0; border-bottom-left-radius: 3px; }
  .typing { display: flex; align-items: center; gap: 5px; padding: 14px 16px; }
  .typing span { width: 6px; height: 6px; background: #aaa; border-radius: 50%; animation: bounce 1.2s infinite; }
  .typing span:nth-child(2) { animation-delay: 0.2s; }
  .typing span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes bounce { 0%,60%,100% { transform: translateY(0); } 30% { transform: translateY(-6px); } }
  footer { background: #fff; border-top: 1px solid #e8e5e0; padding: 16px 24px; flex-shrink: 0; }
  #form { display: flex; gap: 10px; max-width: 768px; margin: 0 auto; }
  #input { flex: 1; border: 1px solid #e8e5e0; border-radius: 10px; padding: 11px 16px; font-size: 14px; font-family: inherit; outline: none; resize: none; line-height: 1.5; max-height: 160px; transition: border-color .15s; }
  #input:focus { border-color: #0f0f0e; }
  #send { background: #0f0f0e; color: #fff; border: none; border-radius: 10px; padding: 11px 20px; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: opacity .15s; }
  #send:hover { opacity: .8; }
  #send:disabled { opacity: .4; cursor: not-allowed; }
  .empty { margin: auto; text-align: center; color: #aaa; }
  .empty h2 { font-size: 20px; font-weight: 600; color: #333; margin-bottom: 8px; }
  .empty p { font-size: 14px; line-height: 1.6; }
  .pills { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 20px; }
  .pill { background: #fff; border: 1px solid #e8e5e0; border-radius: 20px; padding: 8px 16px; font-size: 13px; color: #444; cursor: pointer; transition: all .15s; }
  .pill:hover { border-color: #0f0f0e; color: #0f0f0e; }
</style>
</head>
<body>
<header>
  <div class="logo">
    <svg viewBox="0 0 16 16" fill="none"><rect width="16" height="16" rx="3" fill="#0f0f0e"/><path d="M4 5h8M4 8h6M4 11h4" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg>
  </div>
  <h1>RCM Assistant</h1>
  <span>SAP SuccessFactors Recruiting</span>
</header>

<div id="chat">
  <div class="empty" id="empty">
    <h2>Ask me anything about RCM</h2>
    <p>I'm trained on 9 SAP SuccessFactors Recruiting documents.<br>Ask about configuration, job requisitions, candidates, offers, and more.</p>
    <div class="pills">
      <div class="pill" onclick="ask(this)">How do I create a job requisition?</div>
      <div class="pill" onclick="ask(this)">How does candidate screening work?</div>
      <div class="pill" onclick="ask(this)">How do I set up email notifications?</div>
      <div class="pill" onclick="ask(this)">What are the steps to create a job offer?</div>
    </div>
  </div>
</div>

<footer>
  <form id="form">
    <textarea id="input" placeholder="Ask about SAP SuccessFactors Recruiting..." rows="1"></textarea>
    <button type="submit" id="send">Send</button>
  </form>
</footer>

<script>
  const chat = document.getElementById('chat');
  const form = document.getElementById('form');
  const input = document.getElementById('input');
  const send = document.getElementById('send');
  const empty = document.getElementById('empty');
  let sessionId = localStorage.getItem('rcm_session') || (Math.random().toString(36).slice(2));
  localStorage.setItem('rcm_session', sessionId);

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
  });

  function ask(el) { input.value = el.textContent; form.requestSubmit(); }

  function addMsg(role, text) {
    const div = document.createElement('div');
    div.className = 'msg ' + role;
    const b = document.createElement('div');
    b.className = 'bubble';
    b.textContent = text;
    div.appendChild(b);
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    return b;
  }

  function showTyping() {
    const div = document.createElement('div');
    div.className = 'msg assistant';
    div.id = 'typing';
    div.innerHTML = '<div class="bubble typing"><span></span><span></span><span></span></div>';
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  }

  function removeTyping() {
    const t = document.getElementById('typing');
    if (t) t.remove();
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.style.height = 'auto';
    send.disabled = true;
    if (empty) empty.style.display = 'none';
    addMsg('user', text);
    showTyping();

    let bubble = null;
    let fullText = '';

    try {
      const res = await fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId: sessionId })
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let reading = true;

      while (reading) {
        const chunk = await reader.read();
        if (chunk.done) { reading = false; break; }
        buffer += decoder.decode(chunk.value);
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          if (part.indexOf('data: ') !== 0) continue;
          let parsed = null;
          try { parsed = JSON.parse(part.slice(6)); } catch(e) { continue; }
          if (parsed.type === 'delta') {
            if (!bubble) { removeTyping(); bubble = addMsg('assistant', ''); }
            fullText += parsed.text;
            bubble.textContent = fullText.trim();
            chat.scrollTop = chat.scrollHeight;
          } else if (parsed.type === 'done') {
            if (!bubble) { removeTyping(); addMsg('assistant', fullText || '(no response)'); }
          } else if (parsed.type === 'error') {
            removeTyping();
            addMsg('assistant', 'Sorry, something went wrong. Please try again.');
          }
        }
      }
    } catch(err) {
      removeTyping();
      if (!bubble) addMsg('assistant', 'Sorry, something went wrong. Please try again.');
    } finally {
      send.disabled = false;
      input.focus();
    }
  });
</script>
</body>
</html>`);
});

app.post('/chat', async (req, res) => {
  const { message, sessionId } = req.body;
  if (!message || !sessionId) return res.status(400).json({ error: 'Missing fields' });
  if (!ASSISTANT_ID) return res.status(500).json({ error: 'Assistant not configured' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    let threadId = threads.get(sessionId);
    if (!threadId) {
      const thread = await openai.beta.threads.create();
      threadId = thread.id;
      threads.set(sessionId, threadId);
    }

    await openai.beta.threads.messages.create(threadId, { role: 'user', content: message });

    const stream = openai.beta.threads.runs.stream(threadId, { assistant_id: ASSISTANT_ID });

    stream.on('textDelta', (delta) => {
      if (delta.value) {
        // Strip OpenAI citation markers server-side (avoids non-ASCII chars in browser JS)
        const text = delta.value.replace(/【[^】]*】/g, '');
        if (text) send({ type: 'delta', text: text });
      }
    });

    stream.on('error', (err) => {
      console.error('Stream error:', err.message);
      send({ type: 'error' });
      res.end();
    });

    stream.on('end', () => {
      send({ type: 'done' });
      res.end();
    });

  } catch (err) {
    console.error('Chat error:', err.message);
    send({ type: 'error' });
    res.end();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`RCM chatbot running on port ${PORT}`));
