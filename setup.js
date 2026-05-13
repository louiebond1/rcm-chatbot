require('dotenv').config();
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function setup() {
  const docsDir = path.join(__dirname, 'docs');
  const files = fs.readdirSync(docsDir)
    .filter(f => f.endsWith('.docx'))
    .sort();

  console.log(`Uploading ${files.length} documents to OpenAI...`);

  const fileIds = [];
  for (const file of files) {
    process.stdout.write(`  Uploading: ${file} ... `);
    const uploaded = await openai.files.create({
      file: fs.createReadStream(path.join(docsDir, file)),
      purpose: 'assistants',
    });
    fileIds.push(uploaded.id);
    console.log(`done (${uploaded.id})`);
  }

  console.log('\nCreating vector store...');
  const vs = await openai.vectorStores.create({ name: 'RCM Knowledge Base' });

  console.log('Adding files to vector store...');
  await openai.vectorStores.fileBatches.createAndPoll(vs.id, { file_ids: fileIds });
  console.log(`Vector store ready: ${vs.id}`);

  console.log('\nCreating assistant...');
  const assistant = await openai.beta.assistants.create({
    name: 'RCM Recruiter Assistant',
    instructions: `You are an expert SAP SuccessFactors Recruiting (RCM) assistant helping internal recruiters understand how the system works.

Answer questions clearly and concisely based on the provided documentation. When explaining processes or steps, use numbered lists. Keep answers focused and practical — recruiters want to know what to do, not background theory.

If the answer isn't in the documentation, say so clearly rather than guessing.`,
    model: 'gpt-4o',
    tools: [{ type: 'file_search' }],
    tool_resources: { file_search: { vector_store_ids: [vs.id] } },
  });

  console.log(`\nAssistant created: ${assistant.id}`);
  console.log('\n=== Add these to Railway environment variables ===');
  console.log(`OPENAI_API_KEY=<your key>`);
  console.log(`ASSISTANT_ID=${assistant.id}`);
  console.log('===================================================\n');
}

setup().catch(err => { console.error(err.message); process.exit(1); });
