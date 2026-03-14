// Variables for local state
let currentRoom = '';
let myPeerId = '';
let myName = '';
let isMuted = false;
let isVideoOff = false;
let localStream = null;

// DOM Elements
const lobbyScreen = document.getElementById('lobby-screen');
const mainWorkspace = document.getElementById('main-workspace');
const usernameInput = document.getElementById('username-input');
const joinRoomIdInput = document.getElementById('join-room-id-input');
const generateRoomBtn = document.getElementById('generate-room-btn');
const lobbyJoinBtn = document.getElementById('lobby-join-btn');
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
    console.log("Initializing media preview...");
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        console.log("Media stream acquired successfully.");
        if (previewVideo) {
            previewVideo.srcObject = localStream;
            // Explicitly play to avoid black screen on some browsers
            previewVideo.play().catch(e => console.log("Auto-play blocked or failed", e));
        }
    } catch (err) {
        console.error("Error accessing media devices.", err);
        alert('Could not access camera/microphone. Please ensure you have given permission. Note: WebRTC requires a secure context (HTTPS) or localhost.');
    }
}

function handleJoinConference() {
    console.log("Join Conference clicked.");
    myName = usernameInput.value.trim();
    let requestedRoom = joinRoomIdInput.value.trim();

    if (!myName) {
        alert("Please enter your name.");
        return;
    }

    if (!requestedRoom) {
        alert("Please enter a Room ID or click 'Create Room' to generate one.");
        return;
    }

    currentRoom = requestedRoom;
    window.currentRoom = currentRoom;
    myPeerId = generateId();

    console.log(`Joining Room: ${currentRoom} as ${myName} (${myPeerId})`);

    // Transition UI
    if (lobbyScreen) lobbyScreen.classList.add('hidden');
    if (mainWorkspace) mainWorkspace.classList.remove('hidden');

    // Transfer stream to main view
    if (localVideo && localStream) {
        localVideo.srcObject = localStream;
    }

    // Room Info Setup
    const url = new URL(window.location.href);
    url.searchParams.set('room', currentRoom);
    if (displayRoomId) displayRoomId.value = url.toString();

    // Init WebRTC vars (from webrtc.js)
    if (typeof initWebRTC === 'function') {
        initWebRTC(myPeerId, myName, currentRoom);
    }

    // Connect Signaling (from signaling.js)
    if (typeof connectSignalingServer === 'function') {
        connectSignalingServer((msg) => {
            if(msg.room !== currentRoom) return;
            
            if (typeof handleSignalingMessage === 'function') {
                handleSignalingMessage(msg);
            }

            if (msg.type === 'leave') {
                const leaveSourceId = msg.source || msg.peerId;
                removeRemoteVideo(leaveSourceId);
                addSystemMessage(`Someone left the conference.`);
            }
        }, () => {
            // Connected to Signaling
            if (connectionDot) {
                connectionDot.classList.remove('offline');
                connectionDot.classList.add('online');
            }
            if (connectionStatus) connectionStatus.textContent = 'Connected';

            if (chatInput) chatInput.disabled = false;
            if (sendBtn) sendBtn.disabled = false;

            addSystemMessage(`Joined room: ${currentRoom}`);
            
            // Announce existence to others in the room
            if (typeof sendSignalingMessage === 'function') {
                sendSignalingMessage({ 
                    type: 'join', 
                    peerId: myPeerId, 
                    username: myName, 
                    room: currentRoom 
                });
            }
        });
    }
}

// Event Listeners for Lobby
if (generateRoomBtn) {
    generateRoomBtn.addEventListener('click', () => {
        console.log("Generate Room clicked.");
        const newId = generateId();
        if (joinRoomIdInput) {
            joinRoomIdInput.value = newId;
            console.log("New Room ID generated:", newId);
        }
    });
}

if (lobbyJoinBtn) {
    lobbyJoinBtn.addEventListener('click', handleJoinConference);
}

// Lobby Preview Controls
if (previewToggleAudioBtn) {
    previewToggleAudioBtn.addEventListener('click', () => {
        console.log("Lobby Audio Toggle clicked.");
        isMuted = !isMuted;
        if (typeof toggleAudio === 'function') toggleAudio(!isMuted);
        
        if (isMuted) {
            previewToggleAudioBtn.innerHTML = '<span class="icon">🔇</span>';
            previewToggleAudioBtn.classList.add('muted');
            if (toggleAudioBtn) {
                toggleAudioBtn.innerHTML = '<span class="icon">🔇</span> Unmute';
                toggleAudioBtn.classList.add('muted');
            }
        } else {
            previewToggleAudioBtn.innerHTML = '<span class="icon">🎙️</span>';
            previewToggleAudioBtn.classList.remove('muted');
            if (toggleAudioBtn) {
                toggleAudioBtn.innerHTML = '<span class="icon">🎙️</span> Mute';
                toggleAudioBtn.classList.remove('muted');
            }
        }
    });
}

if (previewToggleVideoBtn) {
    previewToggleVideoBtn.addEventListener('click', () => {
        console.log("Lobby Video Toggle clicked.");
        isVideoOff = !isVideoOff;
        if (typeof toggleVideo === 'function') toggleVideo(!isVideoOff);
        
        if (isVideoOff) {
            previewToggleVideoBtn.innerHTML = '<span class="icon">🙈</span>';
            previewToggleVideoBtn.classList.add('muted');
            if (toggleVideoBtn) {
                toggleVideoBtn.innerHTML = '<span class="icon">🙈</span> Video On';
                toggleVideoBtn.classList.add('muted');
            }
        } else {
            previewToggleVideoBtn.innerHTML = '<span class="icon">📹</span>';
            previewToggleVideoBtn.classList.remove('muted');
            if (toggleVideoBtn) {
                toggleVideoBtn.innerHTML = '<span class="icon">📹</span> Video Off';
                toggleVideoBtn.classList.remove('muted');
            }
        }
    });
}

// Main Video Controls
if (toggleAudioBtn) {
    toggleAudioBtn.addEventListener('click', () => {
        isMuted = !isMuted;
        if (typeof toggleAudio === 'function') toggleAudio(!isMuted);
        
        if (isMuted) {
            toggleAudioBtn.innerHTML = '<span class="icon">🔇</span> Unmute';
            toggleAudioBtn.classList.add('muted');
            if (previewToggleAudioBtn) {
                previewToggleAudioBtn.innerHTML = '<span class="icon">🔇</span>';
                previewToggleAudioBtn.classList.add('muted');
            }
        } else {
            toggleAudioBtn.innerHTML = '<span class="icon">🎙️</span> Mute';
            toggleAudioBtn.classList.remove('muted');
            if (previewToggleAudioBtn) {
                previewToggleAudioBtn.innerHTML = '<span class="icon">🎙️</span>';
                previewToggleAudioBtn.classList.remove('muted');
            }
        }
    });
}

if (toggleVideoBtn) {
    toggleVideoBtn.addEventListener('click', () => {
        isVideoOff = !isVideoOff;
        if (typeof toggleVideo === 'function') toggleVideo(!isVideoOff);
        
        if (isVideoOff) {
            toggleVideoBtn.innerHTML = '<span class="icon">🙈</span> Video On';
            toggleVideoBtn.classList.add('muted');
            if (previewToggleVideoBtn) {
                previewToggleVideoBtn.innerHTML = '<span class="icon">🙈</span>';
                previewToggleVideoBtn.classList.add('muted');
            }
        } else {
            toggleVideoBtn.innerHTML = '<span class="icon">📹</span> Video Off';
            toggleVideoBtn.classList.remove('muted');
            if (previewToggleVideoBtn) {
                previewToggleVideoBtn.innerHTML = '<span class="icon">📹</span>';
                previewToggleVideoBtn.classList.remove('muted');
            }
        }
    });
}

// Room Copy Button
if (copyRoomBtn) {
    copyRoomBtn.addEventListener('click', () => {
        if (!displayRoomId) return;
        displayRoomId.select();
        navigator.clipboard.writeText(displayRoomId.value).then(() => {
            const originalHTML = copyRoomBtn.innerHTML;
            copyRoomBtn.innerHTML = '<span style="font-size:0.7rem">Copied!</span>';
            setTimeout(() => {
                copyRoomBtn.innerHTML = originalHTML;
            }, 2000);
        }).catch(err => console.error('Could not copy', err));
    });
}

// Leave Room
if (leaveRoomBtn) {
    leaveRoomBtn.addEventListener('click', () => {
        window.location.href = window.location.pathname;
    });
}

// Chat Functionality
function sendChat() {
    if (!chatInput) return;
    const text = chatInput.value.trim();
    if (text) {
        if (typeof sendChatMessage === 'function') {
            sendChatMessage(text);
            addChatMessage('You', text, 'local');
            chatInput.value = '';
        }
    }
}

if (sendBtn) sendBtn.addEventListener('click', sendChat);
if (chatInput) {
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChat();
    });
}

function addChatMessage(sender, text, type) {
    if (!chatMessages) return;
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
    if (!containerEl || !videoGrid || !pinnedVideoContainer || !conferenceArea) return;

    if (currentPinnedId === containerId) {
        videoGrid.appendChild(containerEl);
        pinnedVideoContainer.innerHTML = '';
        pinnedVideoContainer.classList.add('hidden');
        conferenceArea.classList.remove('has-pinned');
        currentPinnedId = null;
        return;
    }

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

    if (videoGrid) videoGrid.appendChild(wrapperDiv);
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
            window.togglePin(wrapperId); 
        }
        wrapperDiv.remove();
    }
}

onConnectionStateChange = (peerId, state) => {
    console.log(`Connection ${peerId} state: ${state}`);
    if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        removeRemoteVideo(peerId);
    }
};

onChatMessageReceived = (username, text) => {
    addChatMessage(username || 'Participant', text, 'remote');
};

// Initialization on load
window.addEventListener('load', async () => {
    console.log("Page loaded. Initializing...");
    
    // Check if room is in URL
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');
    if (roomFromUrl && joinRoomIdInput) {
        joinRoomIdInput.value = roomFromUrl;
        joinRoomIdInput.disabled = true;
    }

    // Start media preview
    await initMediaPreview();
});

