const signalingServerUrl = 'wss://webrtc-signal-server-9qhd.onrender.com';
let socket;

function connectSignalingServer(onMessageCallback, onOpenCallback) {
    // Attempt to connect via WebSocket. Use wss:// for secure WebSockets if URL is https
    let wsUrl = signalingServerUrl.replace('https://', 'wss://').replace('http://', 'ws://');
    socket = new WebSocket(wsUrl);
    
    socket.onopen = () => {
        console.log("Connected to signaling server:", wsUrl);
        if(onOpenCallback) onOpenCallback();
    };
    
    socket.onmessage = async (event) => {
        try {
            // Some servers return Blobs instead of strings, handle both
            let data = event.data;
            if (data instanceof Blob) {
                data = await data.text();
            }
            const message = JSON.parse(data);
            onMessageCallback(message);
        } catch (e) {
            console.error("Failed to parse signaling message", e, event.data);
        }
    };
    
    socket.onerror = (err) => {
        console.error("Signaling socket error:", err);
    };

    socket.onclose = () => {
        console.warn("Signaling socket closed");
    };
}

function sendSignalingMessage(message) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
    } else {
        console.warn("Cannot send message, socket not open", message);
    }
}
