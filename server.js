require('dotenv').config();
const express = require('express');
const OpenAI = require('openai');

const app = express();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ASSISTANT_ID = process.env.ASSISTANT_ID;

app.use(express.json());
app.use(express.static('public'));

const threads = new Map();

app.post('/chat', async (req, res) => {
  const { message, sessionId } = req.body;
  if (!message || !sessionId) return res.status(400).json({ error: 'Missing fields' });
  if (!ASSISTANT_ID) return res.status(500).json({ error: 'Assistant not configured' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (data) => res.write('data: ' + JSON.stringify(data) + '\n\n');

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
        // Strip OpenAI citation markers server-side
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
app.listen(PORT, () => console.log('RCM chatbot running on port ' + PORT));
