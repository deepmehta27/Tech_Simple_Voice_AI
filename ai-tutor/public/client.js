document.addEventListener("DOMContentLoaded", async function () {
    const statusEl = document.getElementById("status");
    const bubble = document.getElementById("bubble");
  
    try {
      // 1) Fetch ephemeral key
      const response = await fetch("/session");
      const data = await response.json();
      const EPHEMERAL_KEY = data.client_secret.value;
  
      // 2) Prepare WebRTC connection
      const pc = new RTCPeerConnection();
      const audioEl = document.getElementById("audio");
  
      // When we get audio track from AI
      pc.ontrack = (event) => {
        audioEl.srcObject = event.streams[0];
      };
  
      // 3) Capture microphone
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      pc.addTrack(mediaStream.getTracks()[0]);
  
      // 4) Data channel for text events
      const dc = pc.createDataChannel("oai-events");
      dc.addEventListener("message", (event) => {
        console.log("AI Response:", event.data);
        // Switch bubble to "speaking" state
        updateStatus("AI Responding...", "speaking");
  
        // Reset after a short delay
        setTimeout(() => {
          updateStatus("Listening...", "listening");
        }, 3000);
      });
  
      // 5) Create offer & set local
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
  
      // 6) Send offer to OpenAI
      const baseUrl = "https://api.openai.com/v1/realtime";
      const model = "gpt-4o-realtime-preview-2024-12-17";
  
      const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${EPHEMERAL_KEY}`,
          "Content-Type": "application/sdp",
        },
      });
  
      // 7) AI answer -> set remote
      const answer = {
        type: "answer",
        sdp: await sdpResponse.text()
      };
      await pc.setRemoteDescription(answer);
  
      // Once everything is set up, show "Listening" state
      updateStatus("Listening...", "listening");
  
    } catch (error) {
      console.error("Error initializing AI chat:", error);
      updateStatus("Failed to connect. Please try again.", "");
    }
  
    function updateStatus(text, className) {
      statusEl.innerText = text;
      bubble.className = "bubble " + (className || "");
    }
  });
  