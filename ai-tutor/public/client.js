document.addEventListener("DOMContentLoaded", () => {
  // DOM elements
  const listeningBox = document.getElementById("listening-box");
  const transcriptEl = document.getElementById("transcript");
  const todosContainer = document.getElementById("todos-container");
  const voiceButton = document.getElementById("voice-button");
  const toastEl = document.getElementById("toast");
  const audioEl = document.getElementById("audio");

  let tasks = [];
  let pc = null; // RTCPeerConnection instance
  let dc = null; // DataChannel instance
  let isListening = false;

  // Utility: Show toast message at bottom-left
  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("show");
    setTimeout(() => {
      toastEl.classList.remove("show");
    }, 3000);
  }

  // Render tasks in the "todos-container"
  function renderTasks() {
    todosContainer.innerHTML = "";

    tasks.forEach((task, index) => {
      // Outer div
      const todoItem = document.createElement("div");
      todoItem.className = "todo-item";

      // Left side: content
      const todoContent = document.createElement("div");
      todoContent.className = "todo-content";

      // Circle number
      const todoNumber = document.createElement("div");
      todoNumber.className = "todo-number";
      todoNumber.textContent = index + 1;

      // The actual text
      const todoText = document.createElement("span");
      todoText.className = "todo-text";
      todoText.textContent = task.text;

      // Timestamp
      const todoTimestamp = document.createElement("span");
      todoTimestamp.className = "todo-timestamp";
      todoTimestamp.textContent = task.timestamp
        ? new Date(task.timestamp).toLocaleString()
        : "";

      todoContent.appendChild(todoNumber);
      todoContent.appendChild(todoText);
      todoContent.appendChild(todoTimestamp);

      // Right side: delete button
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "delete-button";
      deleteBtn.innerHTML = "&#128465;"; // trash emoji or use an SVG
      deleteBtn.addEventListener("click", () => {
        tasks.splice(index, 1);
        renderTasks();
      });

      todoItem.appendChild(todoContent);
      todoItem.appendChild(deleteBtn);

      todosContainer.appendChild(todoItem);
    });
  }

  // Handle voice command text
  function handleCommand(commandText) {
    console.log("Handling command:", commandText);
    const text = commandText.toLowerCase().trim();
  
    // For "add buy milk"
    if (text.startsWith("add ")) {
      const toAdd = text.slice(4).trim();
      if (toAdd) {
        tasks.push({ text: toAdd, timestamp: Date.now() });
        renderTasks();
        return `Added task: ${toAdd}`;
      }
      return "Nothing to add.";
    }
  
    // For "delete" or "remove"
    if (text.includes("delete") || text.includes("remove")) {
      // First, look for a digit
      let match = text.match(/\d+/);
      if (!match) {
        // No digit? Check for ordinal words
        // e.g. "first", "second", "third", etc.
        // This example only handles up to five, but you can extend it.
        if (text.includes("first")) match = ["1"];
        else if (text.includes("second")) match = ["2"];
        else if (text.includes("third")) match = ["3"];
        else if (text.includes("fourth")) match = ["4"];
        else if (text.includes("fifth")) match = ["5"];
      }
  
      if (match) {
        // If we found a digit or we replaced ordinal with match = ["2"], etc.
        const taskNumber = parseInt(match[0], 10);
        if (!isNaN(taskNumber) && taskNumber > 0 && taskNumber <= tasks.length) {
          const removed = tasks.splice(taskNumber - 1, 1);
          renderTasks();
          return `Deleted task ${taskNumber}: ${removed[0].text}`;
        }
        return "Invalid task number.";
      }
  
      // If we get here, we have "delete" or "remove" but no ordinal or digit
      return "I heard 'delete' but no valid task number or ordinal (e.g. first, second).";
    }
  
    // Otherwise, not recognized
    return "Command not recognized.";
  }
  

  // Update the transcript text and show/hide the listening box
  function updateListeningUI(text, listening = false) {
    transcriptEl.innerText = text;
    if (listening) {
      listeningBox.classList.remove("hidden");
      voiceButton.classList.add("listening");
    } else {
      listeningBox.classList.add("hidden");
      voiceButton.classList.remove("listening");
    }
  }

  // Initialize the voice bot connection
  async function initVoiceBot() {
    updateListeningUI("Initializing...", true);

    try {
      const response = await fetch("/session");
      const data = await response.json();
      const EPHEMERAL_KEY = data.client_secret.value;

      pc = new RTCPeerConnection();

      // When AI sends audio back (TTS), we attach it to <audio> element
      pc.ontrack = (event) => {
        console.log("Received audio track from AI");
        audioEl.srcObject = event.streams[0];
      };

      // Use the user's microphone stream
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      pc.addTrack(mediaStream.getTracks()[0]);

      // Data channel for receiving transcripts
      dc = pc.createDataChannel("oai-events");
      dc.addEventListener("message", (event) => {
        console.log("Raw AI message:", event.data);
        try {
          const msg = JSON.parse(event.data);
          console.log("Parsed AI message:", msg);

          // Check if we received a final transcript
          // e.g. msg.type === "response.done" ...
          if (
            msg.type === "response.done" &&
            msg.response &&
            msg.response.output &&
            msg.response.output.length > 0 &&
            msg.response.output[0].content &&
            msg.response.output[0].content.length > 0 &&
            msg.response.output[0].content[0].transcript
          ) {
            const transcript = msg.response.output[0].content[0].transcript;
            console.log("Final Transcript:", transcript);

            // We have a final transcript: process it
            updateListeningUI("AI Responding...", true);
            const result = handleCommand(transcript);
            console.log("Command Result:", result);
            showToast(result);

            // After a short delay, show "Listening..." again
            setTimeout(() => {
              updateListeningUI("Listening...", true);
            }, 1500);
          }
        } catch (err) {
          console.warn("Error parsing message:", event.data, err);
        }
      });

      // Offer/answer exchange
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch(
        "https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17",
        {
          method: "POST",
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${EPHEMERAL_KEY}`,
            "Content-Type": "application/sdp",
          },
        }
      );

      const answerSdp = await sdpResponse.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      // Ready to listen
      updateListeningUI("Listening...", true);
      isListening = true;
    } catch (error) {
      console.error("Error initializing AI chat:", error);
      updateListeningUI("Failed to connect. Please try again.", false);
      isListening = false;
    }
  }

  // Stop the voice bot by closing the connection
  function stopVoiceBot() {
    if (dc) {
      dc.close();
      dc = null;
    }
    if (pc) {
      pc.close();
      pc = null;
    }
    isListening = false;
    updateListeningUI("Stopped", false);
  }

  // Toggle voice listening on button click
  voiceButton.addEventListener("click", () => {
    if (isListening) {
      // stop listening
      stopVoiceBot();
    } else {
      // start listening
      initVoiceBot();
    }
  });
});
