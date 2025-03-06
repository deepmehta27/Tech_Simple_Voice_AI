document.addEventListener("DOMContentLoaded", () => {
    // DOM elements
    const listeningBox = document.getElementById("listening-box");
    const transcriptEl = document.getElementById("transcript");
    const todosContainer = document.getElementById("todos-container");
    const voiceButton = document.getElementById("voice-button");
    const toastEl = document.getElementById("toast");
    const audioEl = document.getElementById("audio");
  
    let tasks = [];
    let pc = null;  // RTCPeerConnection instance
    let dc = null;  // DataChannel instance
    let isListening = false;
  
    /* =================== UTILITY FUNCTIONS =================== */
  
    // Show a small notification at the bottom-left
    function showToast(message) {
      toastEl.textContent = message;
      toastEl.classList.add("show");
      setTimeout(() => {
        toastEl.classList.remove("show");
      }, 3000);
    }
  
    // Renders the tasks array into the #todos-container
    function renderTasks() {
      todosContainer.innerHTML = "";
  
      if (tasks.length === 0) {
        todosContainer.innerHTML = `
          <div class="todo-item" style="justify-content: center">
            <p style="color: #666">No tasks yet. Try saying "Add buy milk"</p>
          </div>
        `;
        return;
      }
  
      tasks.forEach((task, index) => {
        const todoItem = document.createElement("div");
        todoItem.className = "todo-item";
  
        // Content container
        const todoContent = document.createElement("div");
        todoContent.className = "todo-content";
  
        // Circle number
        const todoNumber = document.createElement("div");
        todoNumber.className = "todo-number";
        todoNumber.textContent = index + 1;
  
        // Task text
        const todoText = document.createElement("span");
        todoText.className = "todo-text";
        todoText.textContent = task.text;
  
        // Timestamp
        const todoTimestamp = document.createElement("span");
        todoTimestamp.className = "todo-timestamp";
        todoTimestamp.textContent = task.timestamp
          ? new Date(task.timestamp).toLocaleString()
          : "";
  
        // Assemble left side
        todoContent.appendChild(todoNumber);
        todoContent.appendChild(todoText);
        todoContent.appendChild(todoTimestamp);
  
        // Delete button on the right
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "delete-button";
        deleteBtn.innerHTML = "&#128465;"; // trash icon
        deleteBtn.addEventListener("click", () => {
          tasks.splice(index, 1);
          renderTasks();
        });
  
        // Put it all together
        todoItem.appendChild(todoContent);
        todoItem.appendChild(deleteBtn);
        todosContainer.appendChild(todoItem);
      });
    }
  
    /**
     * Processes the final recognized transcript from OpenAI
     * and handles "add" / "delete" / "theme" commands.
     */
    function handleCommand(commandText) {
      console.log("Handling command:", commandText);
      const text = commandText.toLowerCase().trim();
  
      // 1) If user says something like "add buy milk"
      if (text.startsWith("reminder to ")) {
        const toAdd = text.slice(9).trim();
        if (toAdd) {
          tasks.push({ text: toAdd, timestamp: Date.now() });
          renderTasks();
          return `Added task: ${toAdd}`;
        }
        return "Nothing to add.";
      }
  
      // 2) For theme change commands
      if (text.includes("theme")) {
        if (text.includes("light to dark")) {
          document.body.classList.add("dark");
          return "Theme changed to dark";
        } else if (text.includes("dark to light")) {
          document.body.classList.remove("dark");
          return "Theme changed to light";
        } else if (text.includes("toggle theme")) {
          document.body.classList.toggle("dark");
          return "Theme toggled";
        }
      }
  
      // 3) For "delete" or "remove" commands
      if (text.includes("delete") || text.includes("remove")) {
        // First, try to find a digit
        let match = text.match(/\d+/);
        if (!match) {
          // No digit? Check for ordinal words
          if (text.includes("first")) match = ["1"];
          else if (text.includes("second")) match = ["2"];
          else if (text.includes("third")) match = ["3"];
          else if (text.includes("fourth")) match = ["4"];
          else if (text.includes("fifth")) match = ["5"];
        }
    
        if (match) {
          const taskNumber = parseInt(match[0], 10);
          if (!isNaN(taskNumber) && taskNumber > 0 && taskNumber <= tasks.length) {
            const removed = tasks.splice(taskNumber - 1, 1);
            renderTasks();
            return `Deleted task ${taskNumber}: ${removed[0].text}`;
          }
          return "Invalid task number.";
        }
    
        return "I heard 'delete' but no valid task number or ordinal (e.g. first, second).";
      }
  
      // Fallback for unrecognized commands
      return "Command not recognized.";
    }
  
    // Update the transcript text and show/hide the "Listening..." box
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
  
    /* =================== OPENAI REALTIME LOGIC =================== */
  
    // Initializes the RTCPeerConnection to OpenAI Realtime, streams user mic,
    // and handles final transcripts via a DataChannel.
    async function initVoiceBot() {
      updateListeningUI("Initializing...", true);
  
      try {
        // 1) Get ephemeral key from /session
        const response = await fetch("/session");
        const data = await response.json();
        const EPHEMERAL_KEY = data.client_secret.value;
  
        // 2) Create RTCPeerConnection
        pc = new RTCPeerConnection();
  
        // 3) If AI sends back audio (TTS), attach to <audio> element
        pc.ontrack = (event) => {
          console.log("Received audio track from AI");
          audioEl.srcObject = event.streams[0];
        };
  
        // 4) Use the user's microphone
        const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        pc.addTrack(mediaStream.getTracks()[0]);
  
        // 5) Create a data channel to receive transcripts from AI
        dc = pc.createDataChannel("oai-events");
        dc.addEventListener("message", (event) => {
          console.log("Raw AI message:", event.data);
          try {
            const msg = JSON.parse(event.data);
            // Usually final transcripts come with msg.type === "response.done"
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
  
              // Process the recognized command
              updateListeningUI("AI Responding...", true);
              const result = handleCommand(transcript);
              showToast(result);
  
              // Wait a little, then show "Listening..." again
              setTimeout(() => {
                updateListeningUI("Listening...", true);
              }, 1500);
            }
          } catch (err) {
            console.warn("Error parsing message:", event.data, err);
          }
        });
  
        // 6) Create Offer -> send to OpenAI -> get Answer -> setRemoteDescription
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
  
        // Everything is connected now
        updateListeningUI("Listening...", true);
        isListening = true;
      } catch (error) {
        console.error("Error initializing AI chat:", error);
        updateListeningUI("Failed to connect. Please try again.", false);
        isListening = false;
      }
    }
  
    // Stop the voice bot: close the connection
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
  
    // Toggle "start" or "stop" when user clicks the mic button
    voiceButton.addEventListener("click", () => {
      if (isListening) {
        stopVoiceBot();
      } else {
        initVoiceBot();
      }
    });
  
    // Initial rendering
    renderTasks();
  });
  