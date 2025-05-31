// Basic WebSocket mock implementation for React Native
// This provides the minimum functionality needed for Supabase realtime

export class WebSocket {
  constructor(url, protocols) {
    this.url = url;
    this.protocols = protocols;
    this.readyState = 0; // CONNECTING
    this.bufferedAmount = 0;
    
    // Event handlers
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
    
    // Simulate connection
    setTimeout(() => {
      if (this.onopen) {
        this.readyState = 1; // OPEN
        this.onopen({ target: this });
      }
    }, 100);
  }
  
  send(data) {
    // Mock send implementation
    if (this.readyState !== 1) {
      throw new Error('WebSocket is not open');
    }
    
    // Simulate successful send
    return true;
  }
  
  close(code, reason) {
    if (this.readyState === 3) return; // Already closed
    
    this.readyState = 3; // CLOSED
    
    if (this.onclose) {
      this.onclose({
        code: code || 1000,
        reason: reason || '',
        wasClean: true,
        target: this
      });
    }
  }
}

export class WebSocketServer {
  constructor(options) {
    this.options = options;
    this.clients = new Set();
  }
  
  on(event, callback) {
    // Mock event listener
  }
  
  close() {
    // Mock close
  }
}

// Constants
WebSocket.CONNECTING = 0;
WebSocket.OPEN = 1;
WebSocket.CLOSING = 2;
WebSocket.CLOSED = 3; 