const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
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

function createPeerConnection(isInitiator, roomId) {
    peerConnection = new RTCPeerConnection(configuration);

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
        } catch (err) {
            console.error("Error handling offer:", err);
        }
    } else if (message.type === 'answer' && peerConnection) {
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer));
        } catch (err) {
            console.error("Error handling answer:", err);
        }
    } else if (message.type === 'candidate' && peerConnection) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
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
