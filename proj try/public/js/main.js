document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const mainContainer = document.querySelector('.main-container');
    const createUserBtn = document.getElementById("create-user");
    const usernameInput = document.getElementById("username");
    const allUsersHtml = document.getElementById("allusers");
    const localVideo = document.getElementById("localVideo");
    const remoteVideo = document.getElementById("remoteVideo");
    const endCallBtn = document.getElementById("end-call-btn");
    const socket = io();

    // New Control Buttons
    const toggleVideoBtn = document.getElementById('toggle-video-btn');
    const toggleAudioBtn = document.getElementById('toggle-audio-btn');
    const showContactsBtn = document.getElementById('show-contacts-btn'); // This is now the burger menu toggle
    const callerListWrapper = document.querySelector('.caller-list-wrapper');

    // Pomodoro Timer Elements
    const togglePomodoroBtn = document.getElementById('toggle-pomodoro-btn');
    const pomodoroPanel = document.getElementById('pomodoro-panel');
    const studyMinutesInput = document.getElementById('study-minutes'); // New
    const breakMinutesInput = document.getElementById('break-minutes'); // New
    const timerDisplay = document.getElementById('timer-display'); // Inside panel
    const startBtn = document.getElementById('start-timer');
    const resetBtn = document.getElementById('reset-timer');
    const pomodoroLabelPanel = document.getElementById('pomodoro-label'); // Label inside the panel

    const pomodoroBox = document.getElementById('pomodoro-box'); // Floating box
    const pomodoroTimerBox = document.getElementById('pomodoro-timer-box'); // Timer in floating box
    const pomodoroLabelBox = document.getElementById('pomodoro-label-box'); // Label in floating box


    let localStream;
    let localAudioTrack;
    let localVideoTrack;
    let peerConnection; // Make this global so all functions can access it
    let caller = []; // Stores the users involved in the current call [from, to]

    let isVideoOn = true;
    let isAudioOn = true; // Initial state: audio is on

    // --- Sidebar (Burger Menu) Toggle Logic ---
    if (showContactsBtn && callerListWrapper) {
        showContactsBtn.addEventListener('click', () => {
            callerListWrapper.classList.toggle('visible');
        });

        // Optional: Close sidebar if clicking outside of it (excluding pomodoro panel)
        document.addEventListener('click', (e) => {
            if (callerListWrapper.classList.contains('visible') &&
                !callerListWrapper.contains(e.target) &&
                !showContactsBtn.contains(e.target) &&
                !pomodoroPanel.contains(e.target) && // Don't close if clicking inside pomodoro panel
                !togglePomodoroBtn.contains(e.target)) { // Or on its toggle button
                callerListWrapper.classList.remove('visible');
            }
        });
    }

    // ✅ Peer Connection Setup
    const PeerConnection = (function () {
        let peerConnectionInstance;

        const createPeerConnection = () => {
            console.log("Creating a new RTCPeerConnection instance...");
            const config = {
                iceServers: [
                    {
                        urls: 'stun:stun.l.google.com:19302'
                    }
                ]
            };
            const pc = new RTCPeerConnection(config);

            // Add local tracks to peer connection
            if (localStream) {
                // IMPORTANT: Add tracks here, and use replaceTrack later for toggling
                localStream.getTracks().forEach(track => {
                    pc.addTrack(track, localStream);
                    console.log(`Added initial track: ${track.kind} (${track.id}) to peer connection.`);
                });
            } else {
                console.warn("Local stream not available when creating PeerConnection. Ensure startMyVideo() is called.");
            }

            pc.ontrack = function (event) {
                if (remoteVideo.srcObject !== event.streams[0]) {
                    remoteVideo.srcObject = event.streams[0];
                    remoteVideo.muted = false;
                    remoteVideo.volume = 1.0;
                    console.log('Remote stream attached to remoteVideo:', event.streams[0]);
                }
            };
            pc.onicecandidate = function (event) {
                if (event.candidate) {
                    // IMPORTANT: Pass the 'caller' array (which holds [from, to] usernames)
                    // This is crucial for the server to know who to send the candidate to
                    socket.emit("icecandidate", event.candidate, caller);
                    console.log("Emitting ICE candidate:", event.candidate);
                }
            };

            pc.onconnectionstatechange = () => {
                console.log(`PeerConnection state: ${pc.connectionState}`);
                if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                    console.log("Peer connection disconnected or closed. Attempting to end call.");
                    // Only end call if `caller` array has values (i.e., a call was active)
                    if (caller.length > 0) {
                        endCall();
                    }
                }
            };
            pc.onnegotiationneeded = async () => {
                console.log("Negotiation needed event triggered.");
                // This event often fires when tracks are added/removed.
                // The actual offer creation is handled by startCall for initial setup.
                // For track changes (like replaceTrack), negotiation might be handled automatically by browser
                // or might require explicit offer/answer if renegotiation is needed.
                // For simple track.enabled or replaceTrack(null), it often works without explicit renegotiation.
            };

            return pc;
        };

        return {
            getInstance: () => {
                if (!peerConnectionInstance) {
                    peerConnectionInstance = createPeerConnection();
                }
                return peerConnectionInstance;
            },
            resetInstance: () => {
                if (peerConnectionInstance && peerConnectionInstance.connectionState !== 'closed') {
                    console.log("Closing existing peer connection instance.");
                    peerConnectionInstance.close();
                }
                peerConnectionInstance = createPeerConnection();
                console.log("New peer connection instance obtained.");
                return peerConnectionInstance;
            }
        };
    })();

    // ✅ Handle "Create User" click
    createUserBtn.addEventListener("click", () => {
        if (usernameInput.value.trim() !== "") {
            const usernameContainer = document.querySelector(".username-input");
            socket.emit("join-user", usernameInput.value.trim());
            usernameContainer.style.display = "none";
        } else {
            alert("Please enter a username.");
        }
    });

    // ✅ Handle "End Call" click
    endCallBtn.addEventListener("click", () => {
        if (caller.length === 2) {
             // Determine who is the current user and send 'call-ended' to the other
            const currentUser = usernameInput.value.trim();
            const otherUser = caller.find(u => u !== currentUser);
            if (otherUser) {
                socket.emit("call-ended", { from: currentUser, to: otherUser }); // Notify the other user
            }
        }
        endCall(); // Perform local cleanup
        triggerConfetti(); // Play confetti animation
    });

    // ✅ Handle list of joined users
    socket.on("joined", allUsers => {
        console.log("Current joined users:", allUsers);

        allUsersHtml.innerHTML = "";
        const currentUser = usernameInput.value.trim();

        for (const user in allUsers) {
            const li = document.createElement("li");
            li.textContent = `${user} ${user === currentUser ? "(You)" : ""}`;

            if (user !== currentUser) {
                const button = document.createElement("button");
                button.classList.add("call-btn");

                // Disable new call buttons if a call is already active for this user
                // This is important to prevent multiple concurrent calls
                if (caller.length > 0 && (caller[0] === currentUser || caller[1] === currentUser)) {
                    button.disabled = true;
                    button.style.opacity = '0.6';
                    button.style.cursor = 'not-allowed';
                }

                button.addEventListener("click", async () => {
                    // Only allow calling if no call is active for this user
                    if (caller.length === 0 || (caller[0] !== currentUser && caller[1] !== currentUser)) {
                        await startMyVideo(); // Ensure local stream is ready BEFORE initiating call
                        startCall(user);
                    } else {
                        alert("You are already in a call. Please end the current call before starting a new one.");
                    }
                });

                const img = document.createElement("img");
                img.setAttribute("src", "/images/phone.png");
                img.setAttribute("alt", "Call");
                img.setAttribute("width", 20);
                button.appendChild(img);

                li.appendChild(button);
            }

            allUsersHtml.appendChild(li);
        }
    });

    // ✅ Handle incoming offer
    socket.on("offer", async ({ from, to, offer }) => {
        console.log(`Received offer from ${from}`);
        const currentUser = usernameInput.value.trim();

        // If already in a call, reject new offer
        if (caller.length > 0 && (caller[0] === currentUser || caller[1] === currentUser)) {
            console.log(`Already in call. Rejecting offer from ${from}.`);
            socket.emit('call-busy', { from: currentUser, to: from }); // Notify the offerer
            return;
        }

        await startMyVideo(); // Ensure local stream is ready BEFORE accepting offer
        peerConnection = PeerConnection.resetInstance(); // Get a fresh instance and assign to global

        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit("answer", { from, to, answer: peerConnection.localDescription });
            caller = [from, to];
            endCallBtn.classList.remove('d-none');
            document.querySelector(".username-input").style.display = "none";
            socket.emit("join-user", currentUser); // Re-emit to update list for others
            console.log("Accepted offer and sent answer.");
        } catch (error) {
            console.error("Error processing offer:", error);
            endCall();
        }
    });

    // Handle 'call-busy' signal
    socket.on('call-busy', ({ from, to }) => {
        if (to === usernameInput.value.trim()) { // Check if the message is for me (the caller)
            alert(`${from} is currently in another call. Please try again later.`);
            endCall(); // Clean up local state if we were trying to call them
        }
    });

    // ✅ Handle incoming answer
    socket.on("answer", async ({ from, to, answer }) => {
        console.log(`Received answer from ${from}`);
        peerConnection = PeerConnection.getInstance(); // Get the existing instance (should be the one from startCall)
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            endCallBtn.classList.remove('d-none');
            caller = [from, to];
            document.querySelector(".username-input").style.display = "none";
            socket.emit("join-user", usernameInput.value.trim()); // Re-emit to update list for others
            console.log("Received answer and set remote description.");
        } catch (error) {
            console.error("Error processing answer:", error);
            endCall();
        }
    });

    // ✅ Handle ICE candidates
    socket.on("icecandidate", async (candidate) => { // Removed 'caller' parameter as it's not needed here
        console.log("Received ICE candidate:", candidate);
        peerConnection = PeerConnection.getInstance();
        if (!peerConnection || peerConnection.remoteDescription === null || peerConnection.signalingState === 'closed') {
            console.warn("PeerConnection not ready for ICE candidate or already closed. Skipping.");
            return;
        }
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            console.log("Added received ICE candidate.");
        } catch (e) {
            console.error("Error adding received ICE candidate:", e);
        }
    });

    // ✅ Handle call termination signal from the other side
    socket.on("call-ended", ({ from, to }) => {
        console.log(`Call ended by ${from}.`);
        endCall();
    });

    // ✅ Function to start a call (initiator)
    const startCall = async (targetUser) => {
        console.log(`Attempting to call ${targetUser}`);
        await startMyVideo(); // Ensure local stream is always active before starting a call
        peerConnection = PeerConnection.resetInstance(); // Always get a fresh PC instance

        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            caller = [usernameInput.value.trim(), targetUser]; // Set caller immediately
            socket.emit("offer", { from: caller[0], to: caller[1], offer: peerConnection.localDescription });
            endCallBtn.classList.remove('d-none');
            document.querySelector(".username-input").style.display = "none";
            socket.emit("join-user", usernameInput.value.trim()); // Re-emit to update list for others
            console.log("Offer created and sent.");
        } catch (error) {
            console.error("Error creating or sending offer:", error);
            endCall();
        }
    };

    // ✅ Function to end a call (local cleanup)
    const endCall = () => {
        console.log("Ending call and cleaning up resources...");
        if (peerConnection && peerConnection.connectionState !== 'closed') {
            peerConnection.close();
            console.log("Peer connection closed.");
        }
        peerConnection = null; // Clear global reference
        PeerConnection.resetInstance(); // Ensure a fresh peer connection for next call

        endCallBtn.classList.add('d-none'); // Hide end call button
        remoteVideo.srcObject = null; // Clear remote video
        caller = []; // Reset caller information

        // Ensure local audio/video tracks are re-enabled and buttons reflect state
        if (localAudioTrack) {
            localAudioTrack.enabled = true;
            isAudioOn = true;
            toggleAudioBtn.classList.remove('active');
            toggleAudioBtn.querySelector('img').src = '/images/mic-on.png';
            toggleAudioBtn.disabled = false; // Re-enable button
            toggleAudioBtn.style.cursor = 'pointer';
        }
        if (localVideoTrack) {
            localVideoTrack.enabled = true;
            isVideoOn = true;
            toggleVideoBtn.classList.remove('active');
            toggleVideoBtn.querySelector('img').src = '/images/video-on.png';
        }

        // Show username input again after call ends
        document.querySelector(".username-input").style.display = "flex";
        socket.emit("join-user", usernameInput.value.trim()); // Re-emit to update list for others

        // Stop and hide Pomodoro timer if active
        clearInterval(timerInterval);
        isTimerRunning = false;
        pomodoroBox.style.display = 'none'; // Hide the floating box
        pomodoroBox.classList.remove('focus-anim', 'break-anim'); // Clear animations
        console.log("Call ended and resources cleaned up.");
    };

    // ✅ Start webcam and mic
    const startMyVideo = async () => {
        if (localStream && localStream.active) {
            console.log("Local stream already active.");
            return; // Don't re-acquire if already running
        }
        try {
            // Request both audio and video
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            console.log("Local stream acquired:", stream);
            localStream = stream;
            localVideo.srcObject = stream;

            localAudioTrack = stream.getAudioTracks()[0];
            localVideoTrack = stream.getVideoTracks()[0];

            // Set initial state of buttons based on acquired tracks
            if (localAudioTrack) {
                isAudioOn = localAudioTrack.enabled;
                toggleAudioBtn.classList.toggle('active', !isAudioOn); // 'active' means button visually implies it's off
                toggleAudioBtn.querySelector('img').src = isAudioOn ? '/images/mic-on.png' : '/images/mic-off.png';
                toggleAudioBtn.disabled = false; // Ensure button is enabled initially
                toggleAudioBtn.style.cursor = 'pointer';
            }
            if (localVideoTrack) {
                isVideoOn = localVideoTrack.enabled;
                toggleVideoBtn.classList.toggle('active', !isVideoOn);
                toggleVideoBtn.querySelector('img').src = isVideoOn ? '/images/video-on.png' : '/images/video-off.png';
            }

        } catch (error) {
            console.error("Video/Audio capture error:", error);
            // Provide more specific error messages to the user
            if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
                alert("Permission to access webcam and microphone was denied. Please allow permissions in your browser settings to use the app.");
            } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
                alert("No webcam or microphone found. Please ensure devices are connected and working.");
            } else if (error.name === "NotReadableError" || error.name === "TrackStartError") {
                alert("Webcam/microphone is already in use by another application or device error.");
            } else {
                alert(`Unable to access webcam and microphone: ${error.message}.`);
            }
            localStream = null; // Ensure stream is null if acquisition fails
            localAudioTrack = null;
            localVideoTrack = null;
        }
    };

    // --- Media Control Toggles ---
    toggleVideoBtn.addEventListener('click', async () => {
        if (!localVideoTrack && localStream) { // Try to get track if it disappeared but stream is active
            localVideoTrack = localStream.getVideoTracks()[0];
        }

        if (localVideoTrack) {
            isVideoOn = !isVideoOn;
            localVideoTrack.enabled = isVideoOn; // Enable/disable the local track

            // Update button UI
            toggleVideoBtn.classList.toggle('active', !isVideoOn); // 'active' class means button is in the "off" state
            toggleVideoBtn.querySelector('img').src = isVideoOn ? '/images/video-on.png' : '/images/video-off.png';
            console.log(`Video ${isVideoOn ? 'on' : 'off'} locally.`);

            // Important: Update the track being sent to the remote peer
            if (peerConnection && peerConnection.connectionState === 'connected') {
                const videoSender = peerConnection.getSenders().find(sender => sender.track && sender.track.kind === 'video');
                if (videoSender) {
                    try {
                        // Replace the track with null if turning off, or the actual track if turning on
                        await videoSender.replaceTrack(isVideoOn ? localVideoTrack : null);
                        console.log('Video track replaced successfully for remote peer.');
                    } catch (e) {
                        console.error('Error replacing video track for remote peer:', e);
                    }
                } else {
                    console.warn("No video sender found to replace track.");
                }
            }
        } else {
            console.warn("Local video track not available to toggle.");
            await startMyVideo(); // Try to start video again if not present
        }
    });

    toggleAudioBtn.addEventListener('click', async () => {
        if (!localAudioTrack && localStream) { // Try to get track if it disappeared but stream is active
            localAudioTrack = localStream.getAudioTracks()[0];
        }

        // Only allow manual toggle if timer is NOT running OR it's currently a 'break' phase
        if (!isTimerRunning || currentPhase === 'break') {
            if (localAudioTrack) {
                isAudioOn = !isAudioOn;
                localAudioTrack.enabled = isAudioOn; // Enable/disable the local track

                // Update button UI
                toggleAudioBtn.classList.toggle('active', !isAudioOn); // 'active' class means button is in the "off" state
                toggleAudioBtn.querySelector('img').src = isAudioOn ? '/images/mic-on.png' : '/images/mic-off.png';
                console.log(`Audio ${isAudioOn ? 'on' : 'off'} locally.`);

                // Important: Update the track being sent to the remote peer
                if (peerConnection && peerConnection.connectionState === 'connected') {
                    const audioSender = peerConnection.getSenders().find(sender => sender.track && sender.track.kind === 'audio');
                    if (audioSender) {
                        try {
                            // Replace the track with null if muting, or the actual track if unmuting
                            await audioSender.replaceTrack(isAudioOn ? localAudioTrack : null);
                            console.log('Audio track replaced successfully for remote peer.');
                        } catch (e) {
                            console.error('Error replacing audio track for remote peer:', e);
                        }
                    } else {
                        console.warn("No audio sender found to replace track.");
                    }
                }
            }
        } else {
            // If timer is running and it's 'study' phase, prevent manual unmute
            console.warn("Cannot manually unmute microphone during Focus Time.");
            alert("Microphone is automatically muted during Focus Time. Please wait for the break or reset the timer.");
        }
    });

    // --- Pomodoro Timer Logic ---
    let timerInterval;
    let timeLeft = 0;
    let currentPhase = 'study'; // 'study' or 'break'
    let isTimerRunning = false;

    // Use current input values as defaults, or hardcoded if inputs are empty/invalid
    let studyDuration = 25 * 60; // Default
    let breakDuration = 5 * 60;  // Default

    // Initialize inputs to default values if they are empty
    if (!studyMinutesInput.value) studyMinutesInput.value = 25;
    if (!breakMinutesInput.value) breakMinutesInput.value = 5;

    // Function to update the timer display (both in panel and floating box)
    function updateDisplay(seconds) {
        const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
        const secs = String(seconds % 60).padStart(2, '0');
        timerDisplay.innerText = `${mins}:${secs}`;
        pomodoroTimerBox.innerText = `${mins}:${secs}`; // Update floating box
    }

    // Function to update the floating pomodoro box label and animation
    function updatePomodoroBoxUI() {
        pomodoroBox.classList.remove('focus-anim', 'break-anim'); // Clear existing animations
        if (currentPhase === 'study') {
            pomodoroLabelPanel.innerText = 'Focus Time'; // Update panel label
            pomodoroLabelBox.innerText = 'Focus Time'; // Update floating box label
            pomodoroBox.classList.add('focus-anim');
        } else { // 'break'
            pomodoroLabelPanel.innerText = 'Break Time'; // Update panel label
            pomodoroLabelBox.innerText = 'Break Time'; // Update floating box label
            pomodoroBox.classList.add('break-anim');
        }
    }

    // Call this to set initial display and UI
    updateDisplay(studyDuration);
    updatePomodoroBoxUI();
    pomodoroBox.style.display = 'none'; // Ensure floating box is hidden initially


    async function applyMicControlForPomodoro() {
        if (!localAudioTrack && localStream) {
            localAudioTrack = localStream.getAudioTracks()[0]; // Re-get track if somehow lost
        }
        if (!localAudioTrack) {
            console.warn("No local audio track to control for Pomodoro.");
            return;
        }

        const audioSender = peerConnection ? peerConnection.getSenders().find(sender => sender.track && sender.track.kind === 'audio') : null;

        if (currentPhase === 'study') {
            if (localAudioTrack.enabled) { // Only change if it's currently on
                localAudioTrack.enabled = false;
                isAudioOn = false; // Update global state
                toggleAudioBtn.classList.add('active'); // Indicate mic is off
                toggleAudioBtn.querySelector('img').src = '/images/mic-off.png';
                toggleAudioBtn.disabled = true; // DISABLE THE BUTTON FOR STUDY TIME
                toggleAudioBtn.style.cursor = 'not-allowed'; // Visual cue
                console.log("Mic muted for Focus Time.");

                if (audioSender) {
                    try {
                        await audioSender.replaceTrack(null); // Stop sending audio
                        console.log('Audio track replaced with null for remote peer (muted).');
                    } catch (e) {
                        console.error('Error replacing audio track for remote peer (mute):', e);
                    }
                }
            }
        } else { // currentPhase === 'break'
            if (!localAudioTrack.enabled) { // Only change if it's currently off
                localAudioTrack.enabled = true;
                isAudioOn = true; // Update global state
                toggleAudioBtn.classList.remove('active'); // Indicate mic is on
                toggleAudioBtn.querySelector('img').src = '/images/mic-on.png';
                toggleAudioBtn.disabled = false; // ENABLE THE BUTTON FOR BREAK TIME
                toggleAudioBtn.style.cursor = 'pointer'; // Visual cue
                console.log("Mic enabled for Break Time.");

                if (audioSender) {
                    try {
                        await audioSender.replaceTrack(localAudioTrack); // Start sending audio again
                        console.log('Audio track replaced with active track for remote peer (unmuted).');
                    } catch (e) {
                        console.error('Error replacing audio track for remote peer (unmute):', e);
                    }
                }
            }
        }
    }


    function startTimerLogic() {
        if (isTimerRunning) {
            console.log("Timer is already running.");
            return; // Prevent starting multiple intervals
        }
        isTimerRunning = true;
        clearInterval(timerInterval); // Clear any existing interval before starting new one

        applyMicControlForPomodoro(); // Apply initial mic control based on current phase

        timerInterval = setInterval(() => {
            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                isTimerRunning = false; // Timer stops when a phase ends

                // Switch phases and re-apply mic control
                if (currentPhase === 'study') {
                    currentPhase = 'break';
                    timeLeft = breakDuration;
                    alert("Study time is over! It's break time. Your mic is now enabled.");
                } else { // currentPhase === 'break'
                    currentPhase = 'study';
                    timeLeft = studyDuration;
                    alert("Break time is over! It's focus time. Your mic is now muted.");
                }

                updatePomodoroBoxUI(); // Update box UI after phase switch
                updateDisplay(timeLeft);
                applyMicControlForPomodoro(); // Re-apply mic control for the new phase

                // Auto-restart timer for the next phase if in an active call
                if (caller.length > 0) {
                    startTimerLogic(); // Recursively call to start the next phase
                } else {
                    // If not in a call, stop the timer completely after a cycle
                    pomodoroBox.style.display = 'none';
                    pomodoroBox.classList.remove('focus-anim', 'break-anim');
                    // Ensure button is re-enabled if call ends while timer is active
                    if (localAudioTrack) { // Ensure button is re-enabled and mic is on if no call is active
                         localAudioTrack.enabled = true;
                         isAudioOn = true;
                         toggleAudioBtn.classList.remove('active');
                         toggleAudioBtn.querySelector('img').src = '/images/mic-on.png';
                         toggleAudioBtn.disabled = false;
                         toggleAudioBtn.style.cursor = 'pointer';
                    }
                }
                return;
            }
            timeLeft--;
            updateDisplay(timeLeft);
            // Optionally, emit updates to the other peer more frequently if needed
            // For now, we only sync on start/reset/phase change.
        }, 1000);
    }

    togglePomodoroBtn.addEventListener('click', () => {
        pomodoroPanel.classList.toggle('visible');
    });

    startBtn.onclick = () => {
        const customStudyMin = parseInt(studyMinutesInput.value);
        const customBreakMin = parseInt(breakMinutesInput.value);

        // Validate inputs and set durations
        if (!isNaN(customStudyMin) && customStudyMin >= 1 && customStudyMin <= 90) {
            studyDuration = customStudyMin * 60;
        } else {
            alert("Please enter a valid value (1-90) for Study Minutes. Defaulting to 25.");
            studyDuration = 25 * 60;
            studyMinutesInput.value = 25;
        }

        if (!isNaN(customBreakMin) && customBreakMin >= 1 && customBreakMin <= 30) {
            breakDuration = customBreakMin * 60;
        } else {
            alert("Please enter a valid value (1-30) for Break Minutes. Defaulting to 5.");
            breakDuration = 5 * 60;
            breakMinutesInput.value = 5;
        }

        // Always start with study phase on explicit start
        currentPhase = 'study';
        timeLeft = studyDuration;
        updateDisplay(timeLeft);
        updatePomodoroBoxUI(); // Update box UI
        pomodoroBox.style.display = 'block'; // Ensure floating box is visible
        startTimerLogic(); // Start local timer logic

        // Emit to server for broadcasting to the other user
        if (caller.length === 2) { // Only emit if actively in a call
            socket.emit('timer-action', {
                type: 'start',
                studyDuration: studyDuration,
                breakDuration: breakDuration,
                currentPhase: currentPhase,
                timeLeft: timeLeft,
                from: usernameInput.value.trim(),
                to: caller.find(u => u !== usernameInput.value.trim()) // Find the other user
            });
        }
    };

    resetBtn.onclick = () => {
        clearInterval(timerInterval);
        isTimerRunning = false;
        currentPhase = 'study'; // Reset to study phase
        timeLeft = studyDuration; // Reset to configured study duration
        updateDisplay(timeLeft);
        updatePomodoroBoxUI(); // Update box UI
        pomodoroBox.style.display = 'block'; // Ensure floating box is visible (will hide if no call)
        applyMicControlForPomodoro(); // Apply mic control based on reset to study phase

        // Emit to server for broadcasting to the other user
        if (caller.length === 2) { // Only emit if actively in a call
            socket.emit('timer-action', {
                type: 'reset',
                studyDuration: studyDuration, // Send current configurations
                breakDuration: breakDuration,
                currentPhase: currentPhase,
                timeLeft: timeLeft,
                from: usernameInput.value.trim(),
                to: caller.find(u => u !== usernameInput.value.trim())
            });
        }
    };

    // Receiving timer actions from other user
    socket.on('timer-action-remote', ({ type, studyDuration: remoteStudyDuration, breakDuration: remoteBreakDuration, currentPhase: remoteCurrentPhase, timeLeft: remoteTimeLeft }) => {
        console.log(`Received remote timer action: ${type}, Phase: ${remoteCurrentPhase}, Time Left: ${remoteTimeLeft}`);

        // Update local configurations with remote ones
        studyDuration = remoteStudyDuration;
        breakDuration = remoteBreakDuration;
        currentPhase = remoteCurrentPhase;
        timeLeft = remoteTimeLeft;

        updateDisplay(timeLeft);
        updatePomodoroBoxUI(); // Update box UI based on remote phase
        pomodoroBox.style.display = 'block'; // Ensure floating box is visible

        if (type === 'start') {
            startTimerLogic(); // Start timer based on remote state
        } else if (type === 'reset') {
            clearInterval(timerInterval);
            isTimerRunning = false;
            // Times and phase are already updated by remote values
            updateDisplay(timeLeft);
            applyMicControlForPomodoro(); // Apply mic control based on remote reset state
        }
    });

    // --- Confetti Animation ---
    function triggerConfetti() {
        const confettiContainer = document.getElementById('confetti-container');
        if (!confettiContainer) return;

        for (let i = 0; i < 50; i++) { // Generate 50 confetti pieces
            const confetti = document.createElement('div');
            confetti.classList.add('confetti');
            confetti.style.left = `${Math.random() * 100}vw`; // Random horizontal position
            confetti.style.animationDelay = `${Math.random() * 0.5}s`; // Stagger animation
            confetti.style.transform = `scale(${Math.random() * 0.8 + 0.2})`; // Random size
            confetti.style.backgroundColor = `hsl(${Math.random() * 360}, 70%, 50%)`; // Random color

            confettiContainer.appendChild(confetti);

            // Remove confetti after animation to prevent DOM bloat
            confetti.addEventListener('animationend', () => {
                confetti.remove();
            });
        }
    }

    // Initiate webcam/mic on page load
    startMyVideo();
});