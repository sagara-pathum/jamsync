let currentRoom = '';
let myPeerId = '';
let myName = '';
let isMuted = false;
let isVideoOff = false;

// DOM Elements
const lobbyScreen = document.getElementById('lobby-screen');
const mainWorkspace = document.getElementById('main-workspace');
const usernameInput = document.getElementById('username-input');
const joinRoomIdInput = document.getElementById('join-room-id-input');
const lobbyJoinBtn = document.getElementById('lobby-join-btn');
const generateRoomBtn = document.getElementById('generate-room-btn');
const previewVideo = document.getElementById('preview-video');
const previewToggleAudioBtn = document.getElementById('preview-toggle-audio-btn');
const previewToggleVideoBtn = document.getElementById('preview-toggle-video-btn');

const localVideo = document.getElementById('local-video');
const videoGrid = document.getElementById('video-grid');
const conferenceArea = document.getElementById('conference-area');
const pinnedVideoContainer = document.getElementById('pinned-video-container');

const toggleAudioBtn = document.getElementById('toggle-audio-btn');
const toggleVideoBtn = document.getElementById('toggle-video-btn');
const leaveRoomBtn = document.getElementById('leave-room-btn');
const displayRoomId = document.getElementById('display-room-id');
const copyRoomBtn = document.getElementById('copy-room-btn');

const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const chatMessages = document.getElementById('chat-messages');
const connectionDot = document.getElementById('connection-dot');
const connectionStatus = document.getElementById('connection-status');

// Helper to Generate IDs
function generateId() {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
}

// Initialize local media stream for lobby preview
async function initMediaPreview() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        previewVideo.srcObject = localStream;
    } catch (err) {
        console.error("Error accessing media devices.", err);
        alert('Failed to access camera/microphone. Please ensure permissions are granted.');
    }
}

function handleJoinConference() {
    myName = usernameInput.value.trim();
    let requestedRoom = joinRoomIdInput.value.trim();

    if (!myName) {
        alert("Please enter your name.");
        return;
    }

    if (!requestedRoom) {
        alert("Please enter a Room ID or click Create Room to generate one.");
        return;
    }

    currentRoom = requestedRoom;
    window.currentRoom = currentRoom;
    myPeerId = generateId();

    // Transition UI
    lobbyScreen.classList.add('hidden');
    mainWorkspace.classList.remove('hidden');

    // Transfer stream to main view
    localVideo.srcObject = localStream;

    // Room Info Setup
    const url = new URL(window.location.href);
    url.searchParams.set('room', currentRoom);
    displayRoomId.value = url.toString();

    // Init WebRTC vars
    initWebRTC(myPeerId, myName, currentRoom);

    // Connect Signaling
    connectSignalingServer((msg) => {
        if(msg.room !== currentRoom) return;
        
        handleSignalingMessage(msg);

        if (msg.type === 'leave') {
            const leaveSourceId = msg.source || msg.peerId;
            removeRemoteVideo(leaveSourceId);
            addSystemMessage(`Someone left the conference.`);
        }
    }, () => {
        // Connected to Signaling
        connectionDot.classList.remove('offline');
        connectionDot.classList.add('online');
        connectionStatus.textContent = 'Connected';

        chatInput.disabled = false;
        sendBtn.disabled = false;

        addSystemMessage(`Joined room: ${currentRoom}`);
        
        // Announce existence to others in the room
        sendSignalingMessage({ 
            type: 'join', 
            peerId: myPeerId, 
            username: myName, 
            room: currentRoom 
        });
    });
}

if (lobbyJoinBtn) lobbyJoinBtn.addEventListener('click', handleJoinConference);

if (generateRoomBtn) {
    generateRoomBtn.addEventListener('click', () => {
        // Generate a new ID and put it in the input field
        if (joinRoomIdInput) joinRoomIdInput.value = generateId();
    });
}

// Preview Controls
if (previewToggleAudioBtn) {
    previewToggleAudioBtn.addEventListener('click', () => {
        isMuted = !isMuted;
        toggleAudio(!isMuted);
        
        if (isMuted) {
            previewToggleAudioBtn.innerHTML = '<span class="icon">🔇</span>';
            previewToggleAudioBtn.classList.add('muted');
        } else {
            previewToggleAudioBtn.innerHTML = '<span class="icon">🎙️</span>';
            previewToggleAudioBtn.classList.remove('muted');
        }
        
        // Sync main toggle UI to match Lobby choice
        if (toggleAudioBtn) {
            if (isMuted) {
                toggleAudioBtn.innerHTML = '<span class="icon">🔇</span> Unmute';
                toggleAudioBtn.classList.add('muted');
            } else {
                toggleAudioBtn.innerHTML = '<span class="icon">🎙️</span> Mute';
                toggleAudioBtn.classList.remove('muted');
            }
        }
    });
}

if (previewToggleVideoBtn) {
    previewToggleVideoBtn.addEventListener('click', () => {
        isVideoOff = !isVideoOff;
        toggleVideo(!isVideoOff);
        
        if (isVideoOff) {
            previewToggleVideoBtn.innerHTML = '<span class="icon">🙈</span>';
            previewToggleVideoBtn.classList.add('muted');
        } else {
            previewToggleVideoBtn.innerHTML = '<span class="icon">📹</span>';
            previewToggleVideoBtn.classList.remove('muted');
        }

        // Sync main toggle UI to match Lobby choice
        if (toggleVideoBtn) {
            if (isVideoOff) {
                toggleVideoBtn.innerHTML = '<span class="icon">🙈</span> Video On';
                toggleVideoBtn.classList.add('muted');
            } else {
                toggleVideoBtn.innerHTML = '<span class="icon">📹</span> Video Off';
                toggleVideoBtn.classList.remove('muted');
            }
        }
    });
}

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
    window.location.href = window.location.pathname; // strip URL params and restart
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
        const sent = sendChatMessage(text);
        addChatMessage('You', text, 'local');
        chatInput.value = '';
    }
}

sendBtn.addEventListener('click', sendChat);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChat();
});

function addChatMessage(sender, text, type) {
    const div = document.createElement('div');
    div.classList.add('message', type);
    
    const nameSpan = document.createElement('strong');
    nameSpan.textContent = sender + ": ";
    nameSpan.style.display = 'block';
    nameSpan.style.fontSize = '0.8rem';
    nameSpan.style.opacity = '0.7';
    nameSpan.style.marginBottom = '4px';

    const textSpan = document.createElement('span');
    textSpan.textContent = text;

    if (type !== 'system') {
        div.appendChild(nameSpan);
    }
    div.appendChild(textSpan);

    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addSystemMessage(text) {
    addChatMessage('System', text, 'system');
}

// Global scope Pin Controller
let currentPinnedId = null;
window.togglePin = function(containerId) {
    const containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    // Unpin if currently pinned
    if (currentPinnedId === containerId) {
        videoGrid.appendChild(containerEl); // move back to grid
        pinnedVideoContainer.innerHTML = '';
        pinnedVideoContainer.classList.add('hidden');
        conferenceArea.classList.remove('has-pinned');
        currentPinnedId = null;
        return;
    }

    // Pin new
    // If something was already pinned, move it back
    if (currentPinnedId) {
        const oldPinned = document.getElementById(currentPinnedId);
        if (oldPinned) videoGrid.appendChild(oldPinned);
    }

    pinnedVideoContainer.appendChild(containerEl);
    pinnedVideoContainer.classList.remove('hidden');
    conferenceArea.classList.add('has-pinned');
    currentPinnedId = containerId;
};

// WebRTC Callback bindings
onRemoteTrackAdd = (peerId, stream, peerUsername) => {
    const existingContainer = document.getElementById(`remote-wrapper-${peerId}`);
    if (existingContainer) {
        // Just update stream
        const vid = document.getElementById(`remote-video-${peerId}`);
        if(vid && vid.srcObject !== stream) {
            vid.srcObject = stream;
        }
        if (peerUsername) {
            const label = document.getElementById(`remote-label-${peerId}`);
            if(label) label.textContent = peerUsername;
        }
        return;
    }

    // Create new UI element for this peer
    const name = peerUsername || 'Participant';
    const wrapperId = `remote-wrapper-${peerId}`;

    const wrapperDiv = document.createElement('div');
    wrapperDiv.className = 'video-card remote';
    wrapperDiv.id = wrapperId;

    const videoEl = document.createElement('video');
    videoEl.id = `remote-video-${peerId}`;
    videoEl.autoplay = true;
    videoEl.playsInline = true;
    videoEl.srcObject = stream;

    const labelDiv = document.createElement('div');
    labelDiv.className = 'video-label';
    labelDiv.id = `remote-label-${peerId}`;
    labelDiv.textContent = name;

    const pinBtn = document.createElement('button');
    pinBtn.className = 'pin-btn';
    pinBtn.textContent = '📌';
    pinBtn.setAttribute('onclick', `togglePin('${wrapperId}')`);

    wrapperDiv.appendChild(videoEl);
    wrapperDiv.appendChild(labelDiv);
    wrapperDiv.appendChild(pinBtn);

    videoGrid.appendChild(wrapperDiv);
    
    addSystemMessage(`${name} joined.`);
};

onRemoteTrackRemove = (peerId) => {
    removeRemoteVideo(peerId);
};

function removeRemoteVideo(peerId) {
    const wrapperId = `remote-wrapper-${peerId}`;
    const wrapperDiv = document.getElementById(wrapperId);
    
    if (wrapperDiv) {
        if (currentPinnedId === wrapperId) {
            // Unpin it first
            window.togglePin(wrapperId); 
        }
        wrapperDiv.remove();
    }
}

onConnectionStateChange = (peerId, state) => {
    console.log(`Connection ${peerId} state changed to ${state}`);
    if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        removeRemoteVideo(peerId);
        leaveWebRTC(); // Trigger cleanup for this specific peer in webrtc
    }
};

onChatMessageReceived = (username, text) => {
    addChatMessage(username || 'Participant', text, 'remote');
};

// Start getting media on load and check URL
window.onload = async () => {
    await initMediaPreview();
    
    // Check if room is in URL
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');
    if (roomFromUrl) {
        joinRoomIdInput.value = roomFromUrl;
        joinRoomIdInput.disabled = true; // Lock it since they came from invite
    }
};
