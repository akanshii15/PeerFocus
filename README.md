# 🎯 PeerFocus: Synchronized Productivity through Intelligent Video Collaboration

**PeerFocus** is a high-performance video conferencing tool designed specifically for "Body Doubling"—a productivity technique where working with another person increases focus. It bridges the gap between deep work and collaboration by automating the social "rules" of a study session.

🌐 **Live Demo**: [peerfocus.onrender.com](https://peerfocus.onrender.com)  
🚀 **Creator**: [Akanshi Singh](https://github.com/akanshii15)

---

## 💡 The Problem & The Solution

**The Problem:** Standard video calls (Zoom/Meet) are distracting for deep work. Manual muting/unmuting during Pomodoro breaks is tedious and often leads to "hot mic" embarrassments or forgotten unmutes.

**The PeerFocus Solution:**
* **Automatic Social Etiquette:** The app automatically manages your microphone based on the Pomodoro cycle.
* **Zero-Distraction Focus:** During Focus Time, mics are locked to ensure total silence.
* **Instant Socializing:** During Breaks, hardware is "kicked" back to life for immediate interaction.

---

## 🚀 Key Features

### 📡 High-Performance WebRTC
* **P2P Communication:** Direct media streaming using WebRTC for minimal latency.
* **Robust NAT Traversal:** Integrated STUN/TURN relay servers to ensure connectivity across restrictive mobile networks (5G/LTE) and firewalls.
* **Dynamic Track Management:** Uses `RTCRtpSender.replaceTrack()` for seamless mute/unmute transitions without dropping the peer connection.

### ⏱️ Synchronized Pomodoro Engine
* **State Sync:** Real-time synchronization of timers across peers via Socket.io.
* **Intelligent Mic Control:** Automated hardware-level muting during "Focus" phases and "Nuclear Reset" re-acquisition of audio tracks during "Break" phases.

### 📱 Mobile-First Optimization
* **Audio Wake-up:** Handles mobile browser "Auto-play" restrictions by forcing `AudioContext` resumes on user gestures.
* **Responsive UI:** Fully optimized for Safari (iOS) and Chrome (Android) using `playsinline` video delivery.

---

## 🛠️ Tech Stack & Architecture

| Layer | Technology |
| :--- | :--- |
| **Frontend** | HTML5, CSS3 (Animations), JavaScript (ES6+) |
| **Real-time** | WebRTC (Media), Socket.io (Signaling/Sync) |
| **Backend** | Node.js, Express.js |
| **Infrastructure** | Render (Hosting), Coturn (STUN/TURN) |



---

## 🧠 Technical Deep Dive: Challenges Overcome

### 1. The "Silence" Bug (NAT Traversal)
**Challenge:** Devices on different networks (Phone on 5G vs Laptop on Home Wi-Fi) could not establish a peer connection.  
**Solution:** Implemented a TURN server relay configuration in the `RTCConfiguration` to allow media packets to bypass symmetric NAT firewalls that block direct P2P traffic.

### 2. Mobile Audio Hardware Suspension
**Challenge:** Mobile browsers (Safari/Chrome iOS) aggressively suspend audio hardware during long periods of silence (Study Phase).  
**Solution:** Developed a "User Gesture" synchronization logic that re-engages the browser's `AudioContext` and triggers `.play()` on remote media elements when the break begins, bypassing auto-play restrictions.

### 3. State-Based Track Management
**Challenge:** Simple `track.enabled = false` often leaves the hardware "busy" or out of sync.  
**Solution:** Implemented a system to find the specific `RTCRtpSender` and swap the hardware track for a `null` value during focus sessions, completely freeing the hardware while maintaining the WebRTC handshake.

---

## ⚙️ Installation & Local Setup

1. **Clone the repo:**
   ```bash
   git clone [https://github.com/akanshii15/peerfocus.git](https://github.com/akanshii15/peerfocus.git)
   cd peerfocus
2. **Install dependencies**
   npm install
3. **Run the server**
   npm start
4. **Local Testing**
   Open http://localhost:9000. To test across devices locally, use ngrok:
   ngrok http 9000
   
---

## 🧠 Future Enhancements
Integrated In-Call Chat — For real-time text-based collaboration.
Group Video Conferencing — Expand beyond 1:1 sessions.
Productivity Insights — Track session stats and work patterns.
Break-Time Ambience — Add optional Lo-Fi music during breaks.

---

## 🙋‍♀️ Creator
Made with ❤️ by Akanshi Singh Feel free to reach out for collaborations or feedback!
