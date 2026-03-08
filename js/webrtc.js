const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
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

// Callbacks
let onRemoteTrackAdd;
let onConnectionStateChange;
let onChatMessageReceived;

let pendingCandidates = [];

function createPeerConnection(isInitiator, roomId) {
    peerConnection = new RTCPeerConnection(configuration);
    pendingCandidates = []; // reset on new connection

    if (isInitiator) {
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
                room: roomId
            });
        }
    };

    peerConnection.onconnectionstatechange = () => {
        console.log("Connection state:", peerConnection.connectionState);
        if(onConnectionStateChange) {
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

    if (isInitiator) {
        peerConnection.createOffer()
            .then(offer => peerConnection.setLocalDescription(offer))
            .then(() => {
                sendSignalingMessage({
                    type: 'offer',
                    offer: peerConnection.localDescription,
                    room: roomId
                });
            })
            .catch(err => console.error("Error creating offer:", err));
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
        // Only initiate if we don't have a peer connection yet
        if (!peerConnection) {
            console.log("Peer is ready, initiating offer...");
            createPeerConnection(true, roomId);
        }
    } else if (message.type === 'offer') {
        if (!peerConnection) {
            createPeerConnection(false, roomId);
        }
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(message.offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            sendSignalingMessage({
                type: 'answer',
                answer: peerConnection.localDescription,
                room: roomId
            });
            await processPendingCandidates();
        } catch (err) {
            console.error("Error handling offer:", err);
        }
    } else if (message.type === 'answer' && peerConnection) {
        try {
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
        if(onChatMessageReceived) {
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
