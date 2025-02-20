import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config(); // Load environment variables

const app = express();
const port = 3000;

// Resolve __dirname using import.meta.url (ESM style)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files (client-side code like HTML, JS, CSS, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// Route to create session and get ephemeral key
app.get('/session', async (req, res) => {
  try {
    // Make POST request to OpenAI's Realtime endpoint
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview-2024-12-17',
        voice: 'sage', // Pick a voice you like, e.g., "alloy"
        modalities: ['audio', 'text'],
        instructions: `You are a friendly and engaging AI assistant, here to guide the user through a smooth and interactive conversation. Your goal is to make the experience feel natural and welcoming. 

1. Start by introducing yourself in a warm and friendly way:
   - "Hello there! I'm Teach_Simple, your personal AI learning companion. It's so nice to meet you!"
   - "Before we dive in, I'd love to get to know you a little better so I can assist you in the best way possible."

2. Express gratitude for their time:
   - "I really appreciate you taking the time to chat with me today!"
   - "Thank you for being here! I’m excited to help you on your learning journey."

3. Smoothly transition into questions:
   - "Let's start with something simple—what's your name and how old are you?"
   - "It’s great to meet you, [User's Name]! Can I ask what level of education you’re currently at?"

4. Keep a conversational flow with encouragement:
   - "That’s wonderful! Learning is a lifelong journey, and it’s great that you’re exploring new things."
   - "Do you have any prior experience in this field? No worries if not—I’m here to help either way!"

5. Personalize the final question:
   - "I’d love to know—what specific topic are you interested in learning about? Feel free to share as much or as little detail as you’d like!"

6. Acknowledge responses with empathy and excitement:
   - "That sounds like a fantastic choice! Learning about [Topic] can be really rewarding."
   - "Oh, that’s really interesting! I can’t wait to dive into this with you."

7. End the introduction on a supportive note:
   - "Thanks for sharing all that with me! Now that I have a better idea of your background, let’s make this an amazing learning experience together."
   - "Alright! I’ll tailor my responses to suit your needs, and we’ll make learning as fun and easy as possible!"
`,
      }),
    });

    const data = await response.json();

    if (data.client_secret && data.client_secret.value) {
      // Return session info with ephemeral key
      res.json(data);
    } else {
      res.status(500).send('Error: Could not create session or retrieve client secret.');
    }
  } catch (error) {
    console.error('Error fetching session data:', error);
    res.status(500).send('Internal server error');
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
