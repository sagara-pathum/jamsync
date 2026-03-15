const socketUrl = "ws://localhost:3001"; // Update with your backend URL
let socket;
let localStream;
let roomId;
let username;
let myColor;
let peerConnections = {}; // peerId -> RTCPeerConnection
let remoteStreams = {}; // peerId -> MediaStream
let myPeerId = Math.random().toString(36).substr(2, 9);

const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800', '#ff5722'];

const joinBtn = document.getElementById('join-btn');
const leaveBtn = document.getElementById('leave-btn');
const toggleCamBtn = document.getElementById('toggle-cam');
const toggleMicBtn = document.getElementById('toggle-mic');
const sendMsgBtn = document.getElementById('send-msg-btn');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');

joinBtn.addEventListener('click', joinRoom);
leaveBtn.addEventListener('click', leaveRoom);
toggleCamBtn.addEventListener('click', toggleCamera);
toggleMicBtn.addEventListener('click', toggleMic);
sendMsgBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

async function joinRoom() {
    username = document.getElementById('username-input').value.trim();
    roomId = document.getElementById('room-id-input').value.trim();

    if (!username || !roomId) {
        alert("Please enter both Name and Room ID");
        return;
    }

    myColor = colors[Math.floor(Math.random() * colors.length)];
    
    // Hide join form, show chat room
    document.getElementById('join-form').classList.add('hidden');
    document.getElementById('chat-room').classList.remove('hidden');

    // Initialize Local Media (Disabled by default)
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStream.getVideoTracks()[0].enabled = false;
        localStream.getAudioTracks()[0].enabled = false;
        
        setupLocalVideo();
    } catch (err) {
        console.error("Error accessing media devices.", err);
    }

    // Connect to Signaling Server
    connectToSocket();
}

function setupLocalVideo() {
    const mainVideo = document.getElementById('main-video');
    const placeholder = document.getElementById('main-placeholder');
    const initials = document.querySelector('#main-placeholder .user-initials');
    
    mainVideo.srcObject = localStream;
    placeholder.style.backgroundColor = myColor;
    initials.innerText = username.charAt(0).toUpperCase();
    
    // If camera is off, show placeholder
    if (!localStream.getVideoTracks()[0].enabled) {
        mainVideo.classList.add('hidden');
        placeholder.classList.remove('hidden');
    }
}

function connectToSocket() {
    socket = new WebSocket(socketUrl);

    socket.onopen = () => {
        console.log("Connected to signaling server");
        // Join the room
        sendSignal({
            type: 'join',
            room: roomId,
            peerId: myPeerId,
            username: username,
            color: myColor
        });
    };

    socket.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        const { type, from, peerId, offer, answer, candidate, room, text, color, username: senderName } = data;

        if (type === 'peer-joined') {
            // New peer joined, create an offer
            createPeerConnection(peerId, senderName, color, true);
        } else if (type === 'offer') {
            await handleOffer(from, offer, senderName, color);
        } else if (type === 'answer') {
            await handleAnswer(from, answer);
        } else if (type === 'ice-candidate') {
            await handleIceCandidate(from, candidate);
        } else if (type === 'chat-message') {
            displayMessage(senderName, text, color);
        } else if (type === 'leave') {
            removeParticipant(peerId);
        } else if (type === 'existing-peers') {
            // Received list of existing peers in the room
            data.peers.forEach(peer => {
                createPeerConnection(peer.id, peer.username, peer.color, true);
            });
        }
    };
}

function sendSignal(data) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ ...data, room: roomId, from: myPeerId }));
    }
}

function createPeerConnection(peerId, peerUsername, peerColor, isInitiator) {
    const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    peerConnections[peerId] = pc;

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            sendSignal({
                type: 'ice-candidate',
                target: peerId,
                candidate: event.candidate
            });
        }
    };

    pc.ontrack = (event) => {
        if (!remoteStreams[peerId]) {
            remoteStreams[peerId] = new MediaStream();
            addParticipantThumbnail(peerId, peerUsername, peerColor, remoteStreams[peerId]);
        }
        remoteStreams[peerId].addTrack(event.track);
    };

    if (localStream) {
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    if (isInitiator) {
        pc.createOffer().then(offer => {
            return pc.setLocalDescription(offer);
        }).then(() => {
            sendSignal({
                type: 'offer',
                target: peerId,
                offer: pc.localDescription,
                username: username,
                color: myColor
            });
        });
    }

    return pc;
}

async function handleOffer(peerId, offer, peerUsername, peerColor) {
    const pc = createPeerConnection(peerId, peerUsername, peerColor, false);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendSignal({
        type: 'answer',
        target: peerId,
        answer: pc.localDescription
    });
}

async function handleAnswer(peerId, answer) {
    const pc = peerConnections[peerId];
    if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
}

async function handleIceCandidate(peerId, candidate) {
    const pc = peerConnections[peerId];
    if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
}

function addParticipantThumbnail(peerId, peerUsername, peerColor, stream) {
    const row = document.getElementById('participant-row');
    
    const thumb = document.createElement('div');
    thumb.className = 'thumbnail';
    thumb.id = `thumb-${peerId}`;
    thumb.innerHTML = `
        <video id="video-${peerId}" autoplay playsinline></video>
        <div class="placeholder" style="background-color: ${peerColor}">
            <span>${peerUsername.charAt(0).toUpperCase()}</span>
        </div>
        <div class="user-label">${peerUsername}</div>
    `;
    
    const video = thumb.querySelector('video');
    video.srcObject = stream;
    
    // Check if video tracks are enabled (they might not be initially)
    // We might need signaling for cam status too, but for now simple check
    video.addEventListener('loadedmetadata', () => {
        if (stream.getVideoTracks().length > 0 && stream.getVideoTracks()[0].enabled) {
            thumb.querySelector('.placeholder').classList.add('hidden');
        } else {
            video.classList.add('hidden');
        }
    });

    thumb.addEventListener('click', () => {
        switchStage(peerId, peerUsername, peerColor, stream);
    });

    row.appendChild(thumb);
}

function switchStage(peerId, peerUsername, peerColor, stream) {
    const mainVideo = document.getElementById('main-video');
    const placeholder = document.getElementById('main-placeholder');
    const initials = placeholder.querySelector('.user-initials');
    const label = document.querySelector('.stream-stage .user-label');

    mainVideo.srcObject = stream;
    placeholder.style.backgroundColor = peerColor;
    initials.innerText = peerUsername.charAt(0).toUpperCase();
    label.innerText = peerUsername;

    // Toggle visibility based on track status
    if (stream.getVideoTracks().length > 0 && stream.getVideoTracks()[0].enabled) {
        mainVideo.classList.remove('hidden');
        placeholder.classList.add('hidden');
    } else {
        mainVideo.classList.add('hidden');
        placeholder.classList.remove('hidden');
    }
}

function removeParticipant(peerId) {
    const thumb = document.getElementById(`thumb-${peerId}`);
    if (thumb) thumb.remove();
    
    if (peerConnections[peerId]) {
        peerConnections[peerId].close();
        delete peerConnections[peerId];
    }
    delete remoteStreams[peerId];
}

function toggleCamera() {
    const videoTrack = localStream.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;
    
    toggleCamBtn.innerText = videoTrack.enabled ? "Cam On" : "Cam Off";
    toggleCamBtn.classList.toggle('active', videoTrack.enabled);
    
    // Update local UI
    const mainVideo = document.getElementById('main-video');
    const placeholder = document.getElementById('main-placeholder');
    
    if (videoTrack.enabled) {
        mainVideo.classList.remove('hidden');
        placeholder.classList.add('hidden');
    } else {
        mainVideo.classList.add('hidden');
        placeholder.classList.remove('hidden');
    }

    // We should notify other peers about camera status change
    sendSignal({
        type: 'cam-status',
        enabled: videoTrack.enabled
    });
}

function toggleMic() {
    const audioTrack = localStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    
    toggleMicBtn.innerText = audioTrack.enabled ? "Mic On" : "Mic Off";
    toggleMicBtn.classList.toggle('active', audioTrack.enabled);
}

function sendMessage() {
    const text = chatInput.value.trim();
    if (text) {
        sendSignal({
            type: 'chat-message',
            text: text,
            username: username,
            color: myColor
        });
        displayMessage("You", text, myColor);
        chatInput.value = '';
    }
}

function displayMessage(sender, text, color) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message';
    msgDiv.innerHTML = `<span class="user-name" style="color: ${color}">${sender}:</span> ${text}`;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function leaveRoom() {
    if (socket) socket.close();
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    location.reload();
}
