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
    let caller = []; // Stores the users involved in the current call [from, to]

    let isVideoOn = true;
    let isAudioOn = true; // Initial state: audio is on

    // --- Sidebar (Burger Menu) Toggle Logic ---
    if (showContactsBtn && callerListWrapper) {
        showContactsBtn.addEventListener('click', () => {
            callerListWrapper.classList.toggle('visible');
        });

        // Optional: Close sidebar if clicking outside of it
        document.addEventListener('click', (e) => {
            if (callerListWrapper.classList.contains('visible') &&
                !callerListWrapper.contains(e.target) &&
                !showContactsBtn.contains(e.target)) {
                callerListWrapper.classList.remove('visible');
            }
        });
    }

    // ✅ Peer Connection Setup
    const PeerConnection = (function () {
        let peerConnectionInstance;

        const createPeerConnection = () => {
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
                localStream.getTracks().forEach(track => {
                    pc.addTrack(track, localStream);
                });
            } else {
                console.warn("Local stream not available when creating PeerConnection. Call startMyVideo first.");
            }

            pc.ontrack = function (event) {
                if (remoteVideo.srcObject !== event.streams[0]) {
                    remoteVideo.srcObject = event.streams[0];
                    console.log('Remote stream added:', event.streams[0]);
                }
            };
            pc.onicecandidate = function (event) {
                if (event.candidate) {
                    // IMPORTANT: Pass the 'caller' array (which holds [from, to] usernames)
                    socket.emit("icecandidate", event.candidate, caller);
                }
            };

            pc.onconnectionstatechange = (event) => {
                console.log(`PeerConnection state: ${pc.connectionState}`);
                if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                    console.log("Peer connection disconnected or closed. Ending call.");
                    // Only end call if `caller` array has values (i.e., a call was active)
                    if (caller.length > 0) {
                        endCall();
                    }
                }
            };
            pc.onnegotiationneeded = async () => {
                // console.log("Negotiation needed.");
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
                if (peerConnectionInstance) {
                    console.log("Closing existing peer connection.");
                    peerConnectionInstance.close();
                    peerConnectionInstance = null;
                }
                peerConnectionInstance = createPeerConnection(); // Always create a fresh one
                console.log("New peer connection created.");
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
        }
    });

    // ✅ Handle "End Call" click
    endCallBtn.addEventListener("click", (e) => {
        socket.emit("call-ended", caller); // Notify the other user
        endCall(); // Perform local cleanup
        triggerConfetti(); // Play confetti animation
    });

    // ✅ Handle list of joined users
    socket.on("joined", allUsers => {
        console.log({ allUsers });

        allUsersHtml.innerHTML = "";

        for (const user in allUsers) {
            const li = document.createElement("li");
            li.textContent = `${user} ${user === usernameInput.value.trim() ? "(You)" : ""}`;

            if (user !== usernameInput.value.trim()) {
                const button = document.createElement("button");
                button.classList.add("call-btn");

                // Disable new call buttons if a call is already active for this user
                if (caller.length > 0 && (caller[0] === usernameInput.value.trim() || caller[1] === usernameInput.value.trim())) {
                    button.disabled = true;
                    button.style.opacity = '0.6';
                    button.style.cursor = 'not-allowed';
                }

                button.addEventListener("click", () => {
                    // Only allow calling if no call is active for this user
                    if (caller.length === 0 || (caller[0] !== usernameInput.value.trim() && caller[1] !== usernameInput.value.trim())) {
                         startCall(user);
                    } else {
                        alert("You are already in a call. Please end the current call before starting a new one.");
                    }
                });

                const img = document.createElement("img");
                img.setAttribute("src", "/images/phone.png");
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
        // If already in a call, reject new offer (optional, or handle multi-party)
        if (caller.length > 0 && (caller[0] === usernameInput.value.trim() || caller[1] === usernameInput.value.trim())) {
               console.log(`Already in call. Rejecting offer from ${from}.`);
               socket.emit('call-busy', { from: usernameInput.value.trim(), to: from }); // Notify the offerer
               return;
        }

        const pc = PeerConnection.resetInstance(); // Reset for new incoming call
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit("answer", { from, to, answer: pc.localDescription });
            caller = [from, to]; // Set current caller
            endCallBtn.classList.remove('d-none');
            // Hide username input once a call is active or initiated
            document.querySelector(".username-input").style.display = "none";
            // Update call buttons to reflect active call status
            socket.emit("join-user", usernameInput.value.trim()); // Re-emit to update list for others

        } catch (error) {
            console.error("Error handling incoming offer:", error);
            endCall();
        }
    });

    // Handle 'call-busy' signal
    socket.on('call-busy', ({ from, to }) => {
        if (from === usernameInput.value.trim()) {
            alert(`${to} is currently in another call. Please try again later.`);
            endCall(); // Clean up local state if we were trying to call them
        }
    });

    // ✅ Handle incoming answer
    socket.on("answer", async ({ from, to, answer }) => {
        console.log(`Received answer from ${from}`);
        const pc = PeerConnection.getInstance();
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            endCallBtn.classList.remove('d-none');
            caller = [from, to]; // Set current caller
            // Hide username input once a call is active or initiated
            document.querySelector(".username-input").style.display = "none";
            // Update call buttons to reflect active call status
            socket.emit("join-user", usernameInput.value.trim()); // Re-emit to update list for others
        } catch (error) {
            console.error("Error setting remote answer:", error);
            endCall();
        }
    });

    // ✅ Handle ICE candidates
    socket.on("icecandidate", async candidate => {
        console.log("Received ICE candidate:", candidate);
        const pc = PeerConnection.getInstance();
        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.error("Error adding received ICE candidate:", e);
        }
    });

    // ✅ Handle call termination signal from the other side
    socket.on("call-ended", (disconnectedCaller) => {
        console.log("Call ended by other party:", disconnectedCaller);
        endCall();
    });

    // ✅ Function to start a call (initiator)
    const startCall = async (targetUser) => {
        console.log(`Attempting to call ${targetUser}`);
        const pc = PeerConnection.resetInstance();
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit("offer", { from: usernameInput.value.trim(), to: targetUser, offer: pc.localDescription });
            caller = [usernameInput.value.trim(), targetUser]; // Set current caller
            endCallBtn.classList.remove('d-none');
            // Hide username input once a call is active or initiated
            document.querySelector(".username-input").style.display = "none";
            // Update call buttons to reflect active call status
            socket.emit("join-user", usernameInput.value.trim()); // Re-emit to update list for others
        } catch (error) {
            console.error("Error creating or sending offer:", error);
            endCall();
        }
    };

    // ✅ Function to end a call (local cleanup)
    const endCall = () => {
        console.log("Ending call...");
        const pc = PeerConnection.getInstance();
        if (pc && pc.connectionState !== 'closed') {
            pc.close();
        }
        PeerConnection.resetInstance(); // Ensure a fresh peer connection for next call

        endCallBtn.classList.add('d-none');
        remoteVideo.srcObject = null; // Clear remote video
        caller = []; // Reset caller information

        // Stop local stream tracks if desired, or just re-enable local video
        if (localStream) {
            localStream.getTracks().forEach(track => {
                // track.stop(); // Only stop if you want to completely turn off camera/mic
                track.enabled = true; // Ensure they are enabled if previously disabled by timer/toggle
            });
            // Re-assign local stream to ensure it shows up again if it was removed/stopped
            localVideo.srcObject = localStream;
        }

        // Reset media control buttons to "on" state
        isVideoOn = true;
        isAudioOn = true;
        toggleVideoBtn.classList.remove('active');
        toggleVideoBtn.querySelector('img').src = '/images/video-on.png';
        toggleAudioBtn.classList.remove('active');
        toggleAudioBtn.querySelector('img').src = '/images/mic-on.png';
        toggleAudioBtn.disabled = false; // Re-enable button on call end
        toggleAudioBtn.style.cursor = 'pointer';


        // Show username input again after call ends
        document.querySelector(".username-input").style.display = "flex";

        // Re-enable call buttons if they were disabled
        socket.emit("join-user", usernameInput.value.trim()); // Re-emit to update list for others

        // Stop and hide Pomodoro timer
        clearInterval(timerInterval);
        isTimerRunning = false;
        pomodoroBox.style.display = 'none'; // Hide the floating box
        pomodoroBox.classList.remove('focus-anim', 'break-anim'); // Clear animations

        console.log("Call ended and resources cleaned up.");
    };

    // ✅ Start webcam and mic
    const startMyVideo = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            console.log("Local stream acquired:", stream);
            localStream = stream;
            localVideo.srcObject = stream;

            // Store tracks for toggling
            localAudioTrack = stream.getAudioTracks()[0];
            localVideoTrack = stream.getVideoTracks()[0];

            // Set initial state of buttons to "on"
            toggleAudioBtn.classList.remove('active');
            toggleVideoBtn.classList.remove('active');
            toggleAudioBtn.disabled = false; // Ensure button is enabled initially
            toggleAudioBtn.style.cursor = 'pointer';

        } catch (error) {
            console.error("Video capture error:", error);
            alert("Unable to access webcam and microphone. Please ensure permissions are granted.");
        }
    };

    // --- Media Control Toggles ---
    toggleVideoBtn.addEventListener('click', () => {
        if (localVideoTrack) {
            isVideoOn = !isVideoOn;
            localVideoTrack.enabled = isVideoOn;
            toggleVideoBtn.classList.toggle('active', !isVideoOn); // 'active' means off
            toggleVideoBtn.querySelector('img').src = isVideoOn ? '/images/video-on.png' : '/images/video-off.png';
            console.log(`Video ${isVideoOn ? 'on' : 'off'}`);
        }
    });

    toggleAudioBtn.addEventListener('click', () => {
        // Only allow manual toggle if timer is NOT running OR it's currently a 'break' phase
        if (!isTimerRunning || currentPhase === 'break') {
            if (localAudioTrack) {
                isAudioOn = !isAudioOn;
                localAudioTrack.enabled = isAudioOn;
                toggleAudioBtn.classList.toggle('active', !isAudioOn); // 'active' means off
                toggleAudioBtn.querySelector('img').src = isAudioOn ? '/images/mic-on.png' : '/images/mic-off.png';
                console.log(`Audio ${isAudioOn ? 'on' : 'off'}`);
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

    let studyDuration = parseInt(studyMinutesInput.value) * 60 || 25 * 60; // Default 25 minutes
    let breakDuration = parseInt(breakMinutesInput.value) * 60 || 5 * 60;  // Default 5 minutes

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
        } else {
            pomodoroLabelPanel.innerText = 'Break Time'; // Update panel label
            pomodoroLabelBox.innerText = 'Break Time'; // Update floating box label
            pomodoroBox.classList.add('break-anim');
        }
    }

    // Initial setup for displays
    updateDisplay(studyDuration);
    updatePomodoroBoxUI(); // Set initial box label and animation
    // pomodoroBox.style.display = 'block'; // Hide initially, main.js will control visibility when timer starts
    pomodoroBox.style.display = 'none'; // Changed to hide initially

    function startTimerLogic() {
        if (isTimerRunning) return; // Prevent starting multiple intervals
        isTimerRunning = true;
        clearInterval(timerInterval); // Clear any existing interval

        // Initial mic control and button state based on currentPhase
        if (localAudioTrack) {
            if (currentPhase === 'study') {
                localAudioTrack.enabled = false;
                isAudioOn = false;
                toggleAudioBtn.classList.add('active'); // Indicate mic is off
                toggleAudioBtn.querySelector('img').src = '/images/mic-off.png';
                toggleAudioBtn.disabled = true; // DISABLE THE BUTTON FOR STUDY TIME
                toggleAudioBtn.style.cursor = 'not-allowed'; // Visual cue
            } else { // break
                localAudioTrack.enabled = true;
                isAudioOn = true;
                toggleAudioBtn.classList.remove('active'); // Indicate mic is on
                toggleAudioBtn.querySelector('img').src = '/images/mic-on.png';
                toggleAudioBtn.disabled = false; // ENABLE THE BUTTON FOR BREAK TIME
                toggleAudioBtn.style.cursor = 'pointer'; // Visual cue
            }
        }

        timerInterval = setInterval(() => {
            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                isTimerRunning = false;
                // Switch phases
                if (currentPhase === 'study') {
                    currentPhase = 'break';
                    timeLeft = breakDuration;
                    alert("Study time is over! It's break time. Your mic is now enabled.");
                    // Ensure mic is enabled
                    if (localAudioTrack) {
                        localAudioTrack.enabled = true;
                        isAudioOn = true;
                        toggleAudioBtn.classList.remove('active');
                        toggleAudioBtn.querySelector('img').src = '/images/mic-on.png';
                        toggleAudioBtn.disabled = false; // ENABLE BUTTON FOR BREAK
                        toggleAudioBtn.style.cursor = 'pointer';
                    }
                } else { // currentPhase === 'break'
                    currentPhase = 'study';
                    timeLeft = studyDuration;
                    alert("Break time is over! It's focus time. Your mic is now muted.");
                    // Ensure mic is muted
                    if (localAudioTrack) {
                        localAudioTrack.enabled = false;
                        isAudioOn = false;
                        toggleAudioBtn.classList.add('active');
                        toggleAudioBtn.querySelector('img').src = '/images/mic-off.png';
                        toggleAudioBtn.disabled = true; // DISABLE BUTTON FOR STUDY
                        toggleAudioBtn.style.cursor = 'not-allowed';
                    }
                }
                updatePomodoroBoxUI(); // Update box UI after phase switch
                updateDisplay(timeLeft);
                // Auto-restart timer for the next phase
                if (caller.length > 0) { // Only auto-restart if in an active call
                     startTimerLogic();
                } else {
                    // If not in a call, stop the timer completely after a cycle
                    pomodoroBox.style.display = 'none';
                    pomodoroBox.classList.remove('focus-anim', 'break-anim');
                    // Ensure button is re-enabled if call ends while timer is active
                    toggleAudioBtn.disabled = false;
                    toggleAudioBtn.style.cursor = 'pointer';
                }
                return;
            }
            timeLeft--;
            updateDisplay(timeLeft);
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
        startTimerLogic(); // Start local timer

        // Emit to server for broadcasting to the other user
        if (caller.length === 2) { // Only emit if actively in a call
            socket.emit('timer-action', {
                type: 'start',
                studyDuration: studyDuration,
                breakDuration: breakDuration,
                currentPhase: currentPhase,
                timeLeft: timeLeft,
                from: usernameInput.value.trim(),
                to: caller.find(u => u !== usernameInput.value.trim())
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
        // Ensure mic is enabled on reset for the user to decide
        if (localAudioTrack) {
            localAudioTrack.enabled = true;
            isAudioOn = true;
            toggleAudioBtn.classList.remove('active');
            toggleAudioBtn.querySelector('img').src = '/images/mic-on.png';
            toggleAudioBtn.disabled = false; // ENABLE BUTTON ON RESET
            toggleAudioBtn.style.cursor = 'pointer';
        }

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
            // Apply mic control immediately based on the remote current phase
            if (localAudioTrack) {
                if (currentPhase === 'study') {
                    localAudioTrack.enabled = false;
                    isAudioOn = false;
                    toggleAudioBtn.classList.add('active');
                    toggleAudioBtn.querySelector('img').src = '/images/mic-off.png';
                    toggleAudioBtn.disabled = true; // DISABLE BUTTON FOR REMOTE STUDY
                    toggleAudioBtn.style.cursor = 'not-allowed';
                } else { // break
                    localAudioTrack.enabled = true;
                    isAudioOn = true;
                    toggleAudioBtn.classList.remove('active');
                    toggleAudioBtn.querySelector('img').src = '/images/mic-on.png';
                    toggleAudioBtn.disabled = false; // ENABLE BUTTON FOR REMOTE BREAK
                    toggleAudioBtn.style.cursor = 'pointer';
                }
            }
        } else if (type === 'reset') {
            clearInterval(timerInterval);
            isTimerRunning = false;
            // Times and phase are already updated by remote values
            updateDisplay(timeLeft);
            // Ensure mic is enabled on reset for the user to decide
            if (localAudioTrack) {
                localAudioTrack.enabled = true;
                isAudioOn = true;
                toggleAudioBtn.classList.remove('active');
                toggleAudioBtn.querySelector('img').src = '/images/mic-on.png';
                toggleAudioBtn.disabled = false; // ENABLE BUTTON FOR REMOTE RESET
                toggleAudioBtn.style.cursor = 'pointer';
            }
        }
    });

    // --- Confetti Animation ---
    function triggerConfetti() {
        const confettiContainer = document.getElementById('confetti-container');
        for (let i = 0; i < 50; i++) { // Generate 50 confetti pieces
            const confetti = document.createElement('div');
            confetti.classList.add('confetti');
            confetti.style.left = `${Math.random() * 100}vw`; // Random horizontal position
            confetti.style.animationDelay = `${Math.random() * 0.5}s`; // Stagger animation
            confetti.style.transform = `scale(${Math.random() * 0.8 + 0.2})`; // Random size

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