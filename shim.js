// Polyfills for Node.js modules
import { Buffer } from 'buffer';
import process from 'process';
import EventEmitter from 'events';

// Import our WebSocket mock
import { WebSocket, WebSocketServer } from './mocks/ws';

// Make these available globally
if (typeof global !== 'undefined') {
  global.Buffer = Buffer;
  global.process = process;
  global.EventEmitter = EventEmitter;
  
  // Mock WebSocket
  global.WebSocket = global.WebSocket || WebSocket;
  global.WebSocketServer = global.WebSocketServer || WebSocketServer;
  
  // Mock empty modules
  global.http = {};
  global.https = {};
  global.net = {};
  global.tls = {};
} 