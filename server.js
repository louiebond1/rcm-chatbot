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

    const run = await openai.beta.threads.runs.createAndPoll(threadId, { assistant_id: ASSISTANT_ID });
    console.log('Run status:', run.status);

    if (run.status !== 'completed') {
      console.error('Run failed:', run.status, JSON.stringify(run.last_error));
      send({ type: 'error' });
      res.end();
      return;
    }

    const msgs = await openai.beta.threads.messages.list(threadId, { order: 'desc', limit: 1 });
    const raw = msgs.data[0] && msgs.data[0].content && msgs.data[0].content[0] &&
                msgs.data[0].content[0].text && msgs.data[0].content[0].text.value || '';
    const reply = raw.replace(/【[^】]*】/g, '').trim();

    send({ type: 'delta', text: reply });
    send({ type: 'done' });
    res.end();

  } catch (err) {
    console.error('Chat error:', err.message, err.stack);
    send({ type: 'error' });
    res.end();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('RCM chatbot running on port ' + PORT));
