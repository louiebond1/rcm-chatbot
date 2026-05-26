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

    // Use raw SSE iteration — works across all SDK versions
    const stream = await openai.beta.threads.runs.stream(threadId, { assistant_id: ASSISTANT_ID });

    for await (const event of stream) {
      console.log('event:', event.event);
      if (event.event === 'thread.message.delta') {
        const blocks = event.data && event.data.delta && event.data.delta.content;
        if (blocks) {
          for (const block of blocks) {
            if (block.type === 'text' && block.text && block.text.value) {
              // Strip citation markers
              const text = block.text.value.replace(/【[^】]*】/g, '');
              if (text) send({ type: 'delta', text: text });
            }
          }
        }
      } else if (event.event === 'thread.run.failed' || event.event === 'thread.run.cancelled' || event.event === 'thread.run.expired') {
        console.error('Run did not complete:', event.event, JSON.stringify(event.data && event.data.last_error));
        send({ type: 'error' });
        res.end();
        return;
      }
    }

    send({ type: 'done' });
    res.end();

  } catch (err) {
    console.error('Chat error:', err.message);
    send({ type: 'error' });
    res.end();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('RCM chatbot running on port ' + PORT));
