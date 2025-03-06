import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const port = 3000;

// __dirname workaround in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files from the "public" folder
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint to create a Realtime session
app.get('/session', async (req, res) => {
  try {
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview-2024-12-17',
        voice: 'verse',
        modalities: ['audio', 'text'],
        instructions: `
          You are a transcriber for a to-do list app.
          Convert the user's speech to text and send only final transcripts.
          Avoid sending partial transcripts.
        `
      })
    });

    const data = await response.json();

    if (data.client_secret && data.client_secret.value) {
      res.json(data);
    } else {
      res.status(500).send('Error: Could not create session or retrieve client secret.');
    }
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).send('Internal server error');
  }
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
