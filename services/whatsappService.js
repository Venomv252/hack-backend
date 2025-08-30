const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');

class WhatsAppService {
  constructor() {
    this.sock = null;
    this.isConnected = false;
    this.qrCode = null;
    this.connectionState = 'disconnected';
    this.authDir = path.join(__dirname, '../whatsapp-auth');
    
    // Ensure auth directory exists
    if (!fs.existsSync(this.authDir)) {
      fs.mkdirSync(this.authDir, { recursive: true });
    }
  }

  async initialize() {
    try {
      console.log('🔄 Initializing WhatsApp service...');
      
      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
      
      this.sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // Disable deprecated option
        logger: {
          level: 'silent',
          trace: () => {},
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
          fatal: () => {},
          child: () => ({
            level: 'silent',
            trace: () => {},
            debug: () => {},
            info: () => {},
            warn: () => {},
            error: () => {},
            fatal: () => {}
          })
        }
      });

      // Handle connection updates
      this.sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
          this.qrCode = qr;
          console.log('📱 WhatsApp QR Code generated. Scan with your phone:');
          qrcode.generate(qr, { small: true });
          this.connectionState = 'qr_generated';
        }

        if (connection === 'close') {
          const shouldReconnect = (lastDisconnect?.error instanceof Boom) 
            ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
            : true;

          console.log('❌ WhatsApp connection closed due to:', lastDisconnect?.error);
          this.isConnected = false;
          this.connectionState = 'disconnected';

          if (shouldReconnect) {
            console.log('🔄 Reconnecting to WhatsApp...');
            setTimeout(() => this.initialize(), 5000);
          }
        } else if (connection === 'open') {
          console.log('✅ WhatsApp connected successfully!');
          this.isConnected = true;
          this.connectionState = 'connected';
          this.qrCode = null;
        }
      });

      // Save credentials when updated
      this.sock.ev.on('creds.update', saveCreds);

      return true;
    } catch (error) {
      console.error('❌ Failed to initialize WhatsApp service:', error);
      this.connectionState = 'error';
      return false;
    }
  }

  async sendMessage(phoneNumber, message) {
    if (!this.isConnected || !this.sock) {
      throw new Error('WhatsApp is not connected');
    }

    try {
      // Format phone number (remove + and spaces, ensure country code)
      let formattedNumber = phoneNumber.replace(/[^\d]/g, '');
      
      // Add country code if not present (assuming India +91 as default)
      if (!formattedNumber.startsWith('91') && formattedNumber.length === 10) {
        formattedNumber = '91' + formattedNumber;
      }
      
      const jid = formattedNumber + '@s.whatsapp.net';
      
      console.log(`📤 Sending WhatsApp message to ${jid}:`, message);
      
      const result = await this.sock.sendMessage(jid, { text: message });
      
      console.log('✅ WhatsApp message sent successfully:', result.key.id);
      return {
        success: true,
        messageId: result.key.id,
        timestamp: result.messageTimestamp
      };
    } catch (error) {
      console.error('❌ Failed to send WhatsApp message:', error);
      throw error;
    }
  }

  async sendLocationMessage(phoneNumber, latitude, longitude, message = '') {
    if (!this.isConnected || !this.sock) {
      throw new Error('WhatsApp is not connected');
    }

    try {
      let formattedNumber = phoneNumber.replace(/[^\d]/g, '');
      if (!formattedNumber.startsWith('91') && formattedNumber.length === 10) {
        formattedNumber = '91' + formattedNumber;
      }
      
      const jid = formattedNumber + '@s.whatsapp.net';
      
      console.log(`📍 Sending WhatsApp location to ${jid}: ${latitude}, ${longitude}`);
      
      const locationMessage = {
        location: {
          degreesLatitude: latitude,
          degreesLongitude: longitude
        }
      };

      const result = await this.sock.sendMessage(jid, locationMessage);
      
      // Send additional text message if provided
      if (message) {
        await this.sock.sendMessage(jid, { text: message });
      }
      
      console.log('✅ WhatsApp location sent successfully:', result.key.id);
      return {
        success: true,
        messageId: result.key.id,
        timestamp: result.messageTimestamp
      };
    } catch (error) {
      console.error('❌ Failed to send WhatsApp location:', error);
      throw error;
    }
  }

  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      connectionState: this.connectionState,
      qrCode: this.qrCode
    };
  }

  async disconnect() {
    if (this.sock) {
      await this.sock.logout();
      this.sock = null;
      this.isConnected = false;
      this.connectionState = 'disconnected';
      console.log('📱 WhatsApp disconnected');
    }
  }
}

// Create singleton instance
const whatsappService = new WhatsAppService();

module.exports = whatsappService;