const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443?transport=tcp',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ]
};

let peerConnection;
let localStream;
let remoteStream;
let dataChannel;
let pendingCandidates = [];

// Callbacks
let onRemoteTrackAdd;
let onConnectionStateChange;
let onChatMessageReceived;

// isInitiator is set once at join time (true = room creator, false = joiner)
// This prevents the "glare" race condition where both peers try to become initiator
let _isInitiator = false;
let _roomId = '';

function initWebRTC(isInitiator, roomId) {
    _isInitiator = isInitiator;
    _roomId = roomId;
}

function createPeerConnection() {
    if (peerConnection) {
        peerConnection.close();
    }
    peerConnection = new RTCPeerConnection(configuration);
    pendingCandidates = [];
    remoteStream = null;

    if (_isInitiator) {
        dataChannel = peerConnection.createDataChannel('jam-chat');
        setupDataChannel(dataChannel);
    } else {
        peerConnection.ondatachannel = (event) => {
            dataChannel = event.channel;
            setupDataChannel(dataChannel);
        };
    }

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            sendSignalingMessage({
                type: 'candidate',
                candidate: event.candidate,
                room: _roomId
            });
        }
    };

    peerConnection.onicegatheringstatechange = () => {
        console.log("ICE gathering state:", peerConnection.iceGatheringState);
    };

    peerConnection.oniceconnectionstatechange = () => {
        console.log("ICE connection state:", peerConnection.iceConnectionState);
        if (peerConnection.iceConnectionState === 'failed') {
            console.warn("ICE failed, attempting restart...");
            peerConnection.restartIce();
        }
    };

    peerConnection.onconnectionstatechange = () => {
        console.log("Connection state:", peerConnection.connectionState);
        if (onConnectionStateChange) {
            onConnectionStateChange(peerConnection.connectionState);
        }
    };

    peerConnection.ontrack = (event) => {
        if (!remoteStream) {
            remoteStream = new MediaStream();
            if (onRemoteTrackAdd) {
                onRemoteTrackAdd(remoteStream);
            }
        }
        remoteStream.addTrack(event.track);
    };

    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }
}

async function startCall() {
    // Only the room creator (initiator) creates the offer
    if (!_isInitiator) return;
    createPeerConnection();
    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        sendSignalingMessage({
            type: 'offer',
            offer: peerConnection.localDescription,
            room: _roomId
        });
        console.log("Offer sent.");
    } catch (err) {
        console.error("Error creating offer:", err);
    }
}

async function processPendingCandidates() {
    for (const candidate of pendingCandidates) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
            console.error("Error adding pending candidate:", err);
        }
    }
    pendingCandidates = [];
}

async function handleSignalingMessage(message, roomId) {
    if (message.type === 'ready') {
        // The room creator sees this and starts the call
        // The joiner also sends 'ready' so the creator knows to begin
        if (_isInitiator) {
            console.log("Joiner is ready, starting call as initiator...");
            await startCall();
        }
        // If we are NOT the initiator, we wait for the offer
    } else if (message.type === 'offer') {
        // Only the joiner (non-initiator) should receive and handle an offer
        if (!peerConnection) {
            createPeerConnection();
        }
        try {
            console.log("Received offer, creating answer...");
            await peerConnection.setRemoteDescription(new RTCSessionDescription(message.offer));
            await processPendingCandidates();
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            sendSignalingMessage({
                type: 'answer',
                answer: peerConnection.localDescription,
                room: roomId
            });
            console.log("Answer sent.");
        } catch (err) {
            console.error("Error handling offer:", err);
        }
    } else if (message.type === 'answer' && peerConnection) {
        try {
            console.log("Received answer...");
            await peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer));
            await processPendingCandidates();
        } catch (err) {
            console.error("Error handling answer:", err);
        }
    } else if (message.type === 'candidate' && peerConnection) {
        try {
            if (peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
            } else {
                pendingCandidates.push(message.candidate);
            }
        } catch (err) {
            console.error("Error handling candidate:", err);
        }
    }
}

function setupDataChannel(channel) {
    channel.onopen = () => {
        console.log("Data channel is open");
    };
    channel.onmessage = (event) => {
        if (onChatMessageReceived) {
            onChatMessageReceived(event.data);
        }
    };
    channel.onerror = (error) => {
        console.error("Data channel error:", error);
    };
}

function sendChatMessage(text) {
    if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(text);
        return true;
    }
    return false;
}

function toggleAudio(enabled) {
    if (localStream) {
        localStream.getAudioTracks().forEach(track => {
            track.enabled = enabled;
        });
    }
}

function toggleVideo(enabled) {
    if (localStream) {
        localStream.getVideoTracks().forEach(track => {
            track.enabled = enabled;
        });
    }
}

// Ensure cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (peerConnection) {
        peerConnection.close();
    }
    if (socket && socket.readyState === WebSocket.OPEN) {
        sendSignalingMessage({ type: 'leave', room: window.currentRoom });
        socket.close();
    }
});
