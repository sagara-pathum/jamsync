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

// Maps of connections and channels for multiple peers
const peerConnections = {}; 
const dataChannels = {};
const pendingCandidates = {}; 
const remoteStreams = {};

let localStream;
let myPeerId = '';
let myUsername = '';
let currentRoom = '';

// Callbacks required by main.js
let onRemoteTrackAdd;
let onRemoteTrackRemove;
let onConnectionStateChange;
let onChatMessageReceived;

function initWebRTC(peerId, username, roomId) {
    myPeerId = peerId;
    myUsername = username;
    currentRoom = roomId;
}

// Create a connection specifically for one remote peer
function createPeerConnection(targetPeerId) {
    if (peerConnections[targetPeerId]) {
        peerConnections[targetPeerId].close();
    }
    
    const pc = new RTCPeerConnection(configuration);
    peerConnections[targetPeerId] = pc;
    pendingCandidates[targetPeerId] = [];

    // ICE Candidate handling per connection
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            sendSignalingMessage({
                type: 'candidate',
                candidate: event.candidate,
                source: myPeerId,
                target: targetPeerId,
                room: currentRoom
            });
        }
    };

    pc.onconnectionstatechange = () => {
        console.log(`Connection state with ${targetPeerId}:`, pc.connectionState);
        if (onConnectionStateChange) {
            onConnectionStateChange(targetPeerId, pc.connectionState);
        }
    };

    pc.ontrack = (event) => {
        if (!remoteStreams[targetPeerId]) {
            remoteStreams[targetPeerId] = new MediaStream();
        }
        remoteStreams[targetPeerId].addTrack(event.track);
        // Track callback handled differently now, we let signaling messages pass usernames too,
        // but stream will be bound in UI
        if (onRemoteTrackAdd && event.track.kind === 'video') {
            onRemoteTrackAdd(targetPeerId, remoteStreams[targetPeerId]);
        }
    };

    // Add our local tracks to this new connection
    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }

    // Create datachannel if initiator (i.e. we are the one sending offer)
    return pc;
}

async function startCallWithPeer(targetPeerId) {
    const pc = createPeerConnection(targetPeerId);
    
    // Create datachannel
    const channel = pc.createDataChannel('chat');
    setupDataChannel(targetPeerId, channel);

    try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignalingMessage({
            type: 'offer',
            offer: pc.localDescription,
            source: myPeerId,
            target: targetPeerId,
            username: myUsername, // send username for UI
            room: currentRoom
        });
    } catch (err) {
        console.error("Error creating offer:", err);
    }
}

async function processPendingCandidates(targetPeerId) {
    const pc = peerConnections[targetPeerId];
    if (!pc) return;
    const queued = pendingCandidates[targetPeerId] || [];
    for (const candidate of queued) {
        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
            console.error("Error adding pending candidate:", err);
        }
    }
    pendingCandidates[targetPeerId] = [];
}

async function handleSignalingMessage(message) {
    const sourceId = message.source || message.peerId; // From peer
    
    if (message.type === 'join') {
        // A new peer joined the room. They sent a join message to the whole room.
        // If we are already here, we should initiate a call to them.
        if (sourceId !== myPeerId) {
            console.log(`Peer ${sourceId} joined. Initiating call...`);
            await startCallWithPeer(sourceId);
        }
    } else if (message.type === 'offer') {
        const pc = createPeerConnection(sourceId);
        
        // Setup data channel receiver
        pc.ondatachannel = (event) => {
            setupDataChannel(sourceId, event.channel);
        };

        try {
            await pc.setRemoteDescription(new RTCSessionDescription(message.offer));
            await processPendingCandidates(sourceId);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            
            // Tell UI about this peer's name if not known
            if (onRemoteTrackAdd && remoteStreams[sourceId]) {
                onRemoteTrackAdd(sourceId, remoteStreams[sourceId], message.username);
            }

            sendSignalingMessage({
                type: 'answer',
                answer: pc.localDescription,
                source: myPeerId,
                target: sourceId,
                username: myUsername,
                room: currentRoom
            });
        } catch (err) {
            console.error("Error handling offer:", err);
        }
    } else if (message.type === 'answer') {
        const pc = peerConnections[sourceId];
        if (pc) {
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(message.answer));
                await processPendingCandidates(sourceId);
                
                // Track username sent back
                if (onRemoteTrackAdd && remoteStreams[sourceId]) {
                    onRemoteTrackAdd(sourceId, remoteStreams[sourceId], message.username);
                }
            } catch (err) {
                console.error("Error handling answer:", err);
            }
        }
    } else if (message.type === 'candidate') {
        const pc = peerConnections[sourceId];
        if (pc) {
            try {
                if (pc.remoteDescription && pc.remoteDescription.type) {
                    await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
                } else {
                    pendingCandidates[sourceId].push(message.candidate);
                }
            } catch (err) {
                console.error("Error handling candidate:", err);
            }
        } else {
            // We might receive candidate before offer
            if (!pendingCandidates[sourceId]) pendingCandidates[sourceId] = [];
            pendingCandidates[sourceId].push(message.candidate);
        }
    } else if (message.type === 'leave') {
        closePeerConnection(sourceId);
        if (onRemoteTrackRemove) {
            onRemoteTrackRemove(sourceId);
        }
    }
}

function closePeerConnection(peerId) {
    if (peerConnections[peerId]) {
        peerConnections[peerId].close();
        delete peerConnections[peerId];
    }
    if (dataChannels[peerId]) {
        dataChannels[peerId].close();
        delete dataChannels[peerId];
    }
    delete remoteStreams[peerId];
    delete pendingCandidates[peerId];
}

function setupDataChannel(peerId, channel) {
    dataChannels[peerId] = channel;
    channel.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (onChatMessageReceived) {
                onChatMessageReceived(data.username, data.text);
            }
        } catch (e) {
            console.error("Malformed chat message", e);
        }
    };
}

// Broadcast to all peers
function sendChatMessage(text) {
    const payload = JSON.stringify({ username: myUsername, text: text });
    let sentCount = 0;
    for (const peerId in dataChannels) {
        const channel = dataChannels[peerId];
        if (channel && channel.readyState === 'open') {
            channel.send(payload);
            sentCount++;
        }
    }
    return sentCount > 0; // Return true if sent to at least 1 person
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

function leaveWebRTC() {
    for (const peerId in peerConnections) {
        closePeerConnection(peerId);
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    sendSignalingMessage({ type: 'leave', room: currentRoom, peerId: myPeerId });
}

window.addEventListener('beforeunload', leaveWebRTC);
