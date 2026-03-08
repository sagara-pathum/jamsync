let currentRoom = '';
let isMuted = false;
let isVideoOff = false;

// DOM Elements
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const toggleAudioBtn = document.getElementById('toggle-audio-btn');
const toggleVideoBtn = document.getElementById('toggle-video-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const createRoomBtn = document.getElementById('create-room-btn');
const leaveRoomBtn = document.getElementById('leave-room-btn');
const roomIdInput = document.getElementById('room-id-input');
const roomInfo = document.getElementById('room-info');
const displayRoomId = document.getElementById('display-room-id');
const copyRoomBtn = document.getElementById('copy-room-btn');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const chatMessages = document.getElementById('chat-messages');
const connectionDot = document.getElementById('connection-dot');
const connectionStatus = document.getElementById('connection-status');
const remoteContainer = document.getElementById('remote-container');
const remoteWaitingText = document.getElementById('remote-waiting-text');
const remoteLabel = document.getElementById('remote-label');

// Initialize local media stream
async function initMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        addSystemMessage('Camera and microphone access granted.');
    } catch (err) {
        console.error("Error accessing media devices.", err);
        addSystemMessage('Failed to access camera/microphone. Please ensure permissions are granted.');
    }
}

// Join and Create Room Logic
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function handleRoomConnection(roomId, isCreator) {
    currentRoom = roomId;
    window.currentRoom = roomId;
    
    if (createRoomBtn) createRoomBtn.disabled = true;
    joinRoomBtn.disabled = true;
    roomIdInput.disabled = true;
    
    if (isCreator) {
        createRoomBtn.textContent = "Creating...";
    } else {
        joinRoomBtn.textContent = "Connecting...";
    }

    connectSignalingServer((msg) => {
        // Wait for connection / matching room
        if(msg.room !== currentRoom) return;
        
        handleSignalingMessage(msg, currentRoom);
        
        if(msg.type === 'leave') {
            addSystemMessage('Partner left the room.');
            remoteContainer.classList.add('waiting');
            remoteWaitingText.style.display = 'block';
            remoteLabel.style.display = 'none';
            remoteVideo.srcObject = null;
            if(peerConnection) {
                peerConnection.close();
                peerConnection = null;
            }
        }
    }, () => {
        // Connected to Signaling
        connectionDot.classList.remove('offline');
        connectionDot.classList.add('online');
        connectionStatus.textContent = 'Connected';
        
        if (isCreator) {
            createRoomBtn.textContent = "Room Created";
            roomInfo.classList.remove('hidden');
            
            // Generate full URL
            const url = new URL(window.location.href);
            url.searchParams.set('room', roomId);
            displayRoomId.value = url.toString();
        } else {
            joinRoomBtn.textContent = "Joined";
        }
        
        leaveRoomBtn.classList.remove('hidden');
        chatInput.disabled = false;
        sendBtn.disabled = false;
        
        // Fix the role BEFORE sending ready so it's never determined by message timing
        // Creator = initiator (sends offer), Joiner = receiver (sends answer)
        initWebRTC(isCreator, currentRoom);
        
        addSystemMessage(`Joined room: ${currentRoom}. Waiting for partner...`);
        sendSignalingMessage({ type: 'ready', room: currentRoom });
    });
}


if (createRoomBtn) {
    createRoomBtn.addEventListener('click', () => {
        handleRoomConnection(generateRoomId(), true);
    });
}

joinRoomBtn.addEventListener('click', () => {
    const roomId = roomIdInput.value.trim();
    if (!roomId) {
        alert("Please enter a Room ID to join.");
        return;
    }
    handleRoomConnection(roomId, false);
});

if (copyRoomBtn) {
    copyRoomBtn.addEventListener('click', () => {
        displayRoomId.select();
        navigator.clipboard.writeText(displayRoomId.value).then(() => {
            const originalHTML = copyRoomBtn.innerHTML;
            copyRoomBtn.innerHTML = '<span style="font-size:0.7rem">Copied!</span>';
            setTimeout(() => {
                copyRoomBtn.innerHTML = originalHTML;
            }, 2000);
        }).catch(err => {
            console.error('Could not copy text: ', err);
        });
    });
}

leaveRoomBtn.addEventListener('click', () => {
    window.location.reload(); // Quick way to cleanup and restart
});

// Control Buttons
toggleAudioBtn.addEventListener('click', () => {
    isMuted = !isMuted;
    toggleAudio(!isMuted);
    
    if (isMuted) {
        toggleAudioBtn.innerHTML = '<span class="icon">🔇</span> Unmute';
        toggleAudioBtn.classList.add('muted');
    } else {
        toggleAudioBtn.innerHTML = '<span class="icon">🎙️</span> Mute';
        toggleAudioBtn.classList.remove('muted');
    }
});

toggleVideoBtn.addEventListener('click', () => {
    isVideoOff = !isVideoOff;
    toggleVideo(!isVideoOff);
    
    if (isVideoOff) {
        toggleVideoBtn.innerHTML = '<span class="icon">🙈</span> Video On';
        toggleVideoBtn.classList.add('muted');
    } else {
        toggleVideoBtn.innerHTML = '<span class="icon">📹</span> Video Off';
        toggleVideoBtn.classList.remove('muted');
    }
});

// Chat Output Management
function sendChat() {
    const text = chatInput.value.trim();
    if (text) {
        if (sendChatMessage(text)) {
            addChatMessage('You', text, 'local');
            chatInput.value = '';
        } else {
            addSystemMessage('Cannot send message. Partner is not connected.');
        }
    }
}

sendBtn.addEventListener('click', sendChat);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChat();
});

function addChatMessage(sender, text, type) {
    const div = document.createElement('div');
    div.classList.add('message', type);
    div.textContent = text; // Just text
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addSystemMessage(text) {
    addChatMessage('System', text, 'system');
}

// Bind WebRTC Callbacks
onRemoteTrackAdd = (stream) => {
    remoteVideo.srcObject = stream;
    remoteContainer.classList.remove('waiting');
    remoteWaitingText.style.display = 'none';
    remoteLabel.style.display = 'block';
};

onConnectionStateChange = (state) => {
    if (state === 'connected') {
        addSystemMessage('Partner connected successfully!');
    } else if (state === 'disconnected' || state === 'failed') {
        addSystemMessage('Partner disconnected.');
        remoteContainer.classList.add('waiting');
        remoteWaitingText.style.display = 'block';
        remoteLabel.style.display = 'none';
        remoteVideo.srcObject = null;
        if(peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
    }
};

onChatMessageReceived = (text) => {
    addChatMessage('Partner', text, 'remote');
};

// Start getting media on load and check URL
window.onload = async () => {
    await initMedia();
    
    // Check if room is in URL
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');
    if (roomFromUrl) {
        roomIdInput.value = roomFromUrl;
        addSystemMessage('Room link detected. Click "Join Existing Room" to enter.');
    }
};
