const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Vonage } = require('@vonage/server-sdk');
const whatsappService = require('./services/whatsappService');
require('dotenv').config();

// Vonage Configuration
const VONAGE_API_KEY = process.env.VONAGE_API_KEY || 'e1afa2fb';
const VONAGE_API_SECRET = process.env.VONAGE_API_SECRET || 'hBd627eA6Ne7o4Jp';
const VONAGE_FROM_NUMBER = process.env.VONAGE_FROM_NUMBER || 'SmartSafety';

// Initialize Vonage client only if credentials are available
let vonageClient = null;
if (VONAGE_API_KEY && VONAGE_API_SECRET) {
  try {
    vonageClient = new Vonage({
      apiKey: VONAGE_API_KEY,
      apiSecret: VONAGE_API_SECRET
    });
    console.log('✅ Vonage client initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize Vonage client:', error.message);
  }
} else {
  console.warn('⚠️ Vonage credentials not configured. SMS functionality will be disabled.');
}

// Environment validation
const requiredEnvVars = ['MONGODB_URI'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars);
  console.error('Please check your .env file or environment configuration');
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}


const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// MongoDB Connection
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/smartsafetyband';

    // Simple and compatible MongoDB connection options
    const options = {
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
    };

    await mongoose.connect(mongoURI, options);
    console.log('✅ MongoDB Connected Successfully');
    console.log(`📍 Database: ${mongoose.connection.name}`);
    console.log(`🔗 Connection state: ${mongoose.connection.readyState}`);
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
    console.error('Full error:', error);
    throw error; // Don't exit immediately, let the caller handle it
  }
};

// User Schema
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  phone: {
    type: String,
    required: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  emergencyContacts: [{
    id: String,
    name: String,
    phone: String,
    relationship: String
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Activity Schema
const activitySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['sync', 'location', 'emergency', 'system']
  },
  message: {
    type: String,
    required: true
  },
  status: {
    type: String,
    required: true,
    enum: ['success', 'warning', 'error', 'normal'],
    default: 'normal'
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Sensor Data Schema
const sensorDataSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  deviceId: {
    type: String,
    required: true
  },
  heartRate: {
    type: Number,
    min: 0,
    max: 300
  },
  temperature: {
    type: Number,
    min: -50,
    max: 100
  },
  accelerometer: {
    x: Number,
    y: Number,
    z: Number
  },
  gyroscope: {
    x: Number,
    y: Number,
    z: Number
  },
  location: {
    latitude: Number,
    longitude: Number,
    accuracy: Number
  },
  batteryLevel: {
    type: Number,
    min: 0,
    max: 100
  },
  emergencyTriggered: {
    type: Boolean,
    default: false
  },
  fallDetected: {
    type: Boolean,
    default: false
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const User = mongoose.model('User', userSchema);
const Activity = mongoose.model('Activity', activitySchema);
const SensorData = mongoose.model('SensorData', sensorDataSchema);

// Auth Middleware
const auth = async (req, res, next) => {
  try {
    const token = req.header('x-auth-token');
    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.user = decoded.user;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

// Routes

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'Smart Safety Band API',
    whatsapp: whatsappService.getConnectionStatus()
  });
});

// Register User
app.post('/api/users/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    // Check if user exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Create new user
    user = new User({
      name,
      email,
      phone,
      password,
      emergencyContacts: [
        { id: '1', name: 'Emergency Services', phone: '112', relationship: 'Emergency' }
      ]
    });

    // Hash password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    await user.save();

    // Create JWT token
    const payload = {
      user: {
        id: user.id
      }
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' },
      (err, token) => {
        if (err) throw err;
        res.json({
          token,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            emergencyContacts: user.emergencyContacts
          }
        });
      }
    );
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Login User
app.post('/api/users/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Create JWT token
    const payload = {
      user: {
        id: user.id
      }
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' },
      (err, token) => {
        if (err) throw err;
        res.json({
          token,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            emergencyContacts: user.emergencyContacts
          }
        });
      }
    );
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get User Profile
app.get('/api/users/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      emergencyContacts: user.emergencyContacts
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update User Profile
app.put('/api/users/profile', auth, async (req, res) => {
  try {
    const { name, email, phone, emergencyContacts, currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // If changing password, verify current password
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ message: 'Current password is required to change password' });
      }

      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({ message: 'Current password is incorrect' });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ message: 'New password must be at least 6 characters' });
      }

      // Hash new password
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(newPassword, salt);
    }

    // Check if email is being changed and if it's already taken
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return res.status(400).json({ message: 'Email is already registered' });
      }
      user.email = email.toLowerCase();
    }

    // Update other fields
    if (name) user.name = name;
    if (phone) user.phone = phone;
    if (emergencyContacts) user.emergencyContacts = emergencyContacts;

    await user.save();

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      emergencyContacts: user.emergencyContacts
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Activity endpoints
// Get user activities
app.get('/api/activities', auth, async (req, res) => {
  try {
    const { type, limit = 20, skip = 0 } = req.query;

    let query = { userId: req.user.id };
    if (type && type !== 'all') {
      query.type = type;
    }

    const activities = await Activity.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    const total = await Activity.countDocuments(query);

    res.json({
      activities,
      total,
      hasMore: (parseInt(skip) + parseInt(limit)) < total
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create activity (for system/device events)
app.post('/api/activities', auth, async (req, res) => {
  try {
    const { type, message, status = 'normal', metadata = {} } = req.body;

    const activity = new Activity({
      userId: req.user.id,
      type,
      message,
      status,
      metadata
    });

    await activity.save();
    res.status(201).json(activity);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get activity statistics
app.get('/api/activities/stats', auth, async (req, res) => {
  try {
    const stats = await Activity.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(req.user.id) } },
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);

    const formattedStats = {
      all: await Activity.countDocuments({ userId: req.user.id }),
      sync: 0,
      location: 0,
      emergency: 0,
      system: 0
    };

    stats.forEach(stat => {
      formattedStats[stat._id] = stat.count;
    });

    res.json(formattedStats);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Sensor Data Routes

// Receive data from ESP32 (your specific endpoint)
app.post('/receive', async (req, res) => {
  try {
    console.log('\n=== ESP32 DATA RECEIVED ===');
    console.log('🕐 Timestamp:', new Date().toISOString());
    console.log('📡 Raw ESP32 request body:', JSON.stringify(req.body, null, 2));
    console.log('📋 Request headers:', JSON.stringify(req.headers, null, 2));
    console.log('🌐 Request IP:', req.ip || req.connection.remoteAddress);

    const { accelerometer, gyroscope, latitude, longitude, timestamp, heartRate, temperature, batteryLevel } = req.body;

    // Extract values from nested objects
    const accX = accelerometer?.x || 0;
    const accY = accelerometer?.y || 0;
    const accZ = accelerometer?.z || 0;
    const gyroX = gyroscope?.x || 0;
    const gyroY = gyroscope?.y || 0;
    const gyroZ = gyroscope?.z || 0;

    console.log('🔄 Processed ESP32 data:', {
      accelerometer: { x: accX, y: accY, z: accZ },
      gyroscope: { x: gyroX, y: gyroY, z: gyroZ },
      location: { latitude, longitude },
      heartRate,
      temperature,
      batteryLevel,
      timestamp: timestamp || new Date().toISOString()
    });

    // Calculate derived values
    const totalAcceleration = Math.sqrt(accX * accX + accY * accY + accZ * accZ);
    const totalRotation = Math.sqrt(gyroX * gyroX + gyroY * gyroY + gyroZ * gyroZ);

    console.log('📊 Calculated values:', {
      totalAcceleration: totalAcceleration.toFixed(2) + 'g',
      totalRotation: totalRotation.toFixed(2) + '°/s'
    });

    // For now, we'll use demo user since ESP32 doesn't send user info
    // You can modify this to include deviceId in your ESP32 code later
    let user = await User.findOne({ email: 'rahul.sharma@smartsafetyband.com' });

    if (!user) {
      // Create demo user if doesn't exist
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('demo123', salt);

      user = new User({
        name: 'Rahul Sharma',
        email: 'rahul.sharma@smartsafetyband.com',
        phone: '+91 98765 43210',
        password: hashedPassword,
        emergencyContacts: [
          { id: '1', name: 'Sunita Sharma', phone: '+91 98765 43211', relationship: 'Mother' },
          { id: '2', name: 'Amit Kumar', phone: '+91 87654 32109', relationship: 'Friend' },
          { id: '3', name: 'Emergency Services', phone: '112', relationship: 'Emergency' }
        ]
      });

      await user.save();
      console.log('✅ Created demo user for ESP32 data');
    }

    // Create sensor data entry
    const sensorData = new SensorData({
      userId: user._id,
      deviceId: 'ESP32_001', // You can make this dynamic later
      accelerometer: {
        x: accX,
        y: accY,
        z: accZ
      },
      gyroscope: {
        x: gyroX,
        y: gyroY,
        z: gyroZ
      },
      location: latitude && longitude ? {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        accuracy: 10 // Estimated GPS accuracy
      } : undefined,
      heartRate: heartRate ? parseInt(heartRate) : undefined,
      temperature: temperature ? parseFloat(temperature) : undefined,
      batteryLevel: batteryLevel ? parseInt(batteryLevel) : undefined,
      timestamp: timestamp ? new Date(parseInt(timestamp)) : new Date()
    });

    console.log('💾 Attempting to save sensor data:');
    console.log('   User ID:', user._id);
    console.log('   Device ID: ESP32_001');
    console.log('   Accelerometer:', { x: accX, y: accY, z: accZ });
    console.log('   Gyroscope:', { x: gyroX, y: gyroY, z: gyroZ });
    console.log('   Location:', latitude && longitude ? { latitude, longitude } : 'No GPS data');
    console.log('   Heart Rate:', heartRate || 'Not provided');
    console.log('   Temperature:', temperature || 'Not provided');
    console.log('   Battery Level:', batteryLevel || 'Not provided');
    console.log('   Timestamp:', timestamp ? new Date(parseInt(timestamp)).toISOString() : 'Using current time');

    let savedSensorData;
    try {
      savedSensorData = await sensorData.save();
      console.log('✅ SENSOR DATA SAVED SUCCESSFULLY!');
      console.log('   Record ID:', savedSensorData._id);
      console.log('   Created At:', savedSensorData.createdAt);
      console.log('   Database State:', mongoose.connection.readyState, '(1=connected)');
      console.log('   Database Name:', mongoose.connection.name);
    } catch (saveError) {
      console.error('❌ ERROR SAVING SENSOR DATA:');
      console.error('   Error Message:', saveError.message);
      console.error('   Error Stack:', saveError.stack);
      console.error('   Database State:', mongoose.connection.readyState);
      console.error('   Database Name:', mongoose.connection.name);
      throw saveError;
    }

    // Check for fall detection based on accelerometer data
    let fallDetected = false;
    let emergencyTriggered = false;

    // Simple fall detection algorithm
    if (totalAcceleration > 15 || totalAcceleration < 2) {
      fallDetected = true;

      const fallActivity = new Activity({
        userId: user._id,
        type: 'emergency',
        message: `Potential fall detected! Total acceleration: ${totalAcceleration.toFixed(2)}g`,
        status: 'warning',
        metadata: {
          deviceId: 'ESP32_001',
          accelerometer: { x: accX, y: accY, z: accZ },
          gyroscope: { x: gyroX, y: gyroY, z: gyroZ },
          location: latitude && longitude ? { latitude, longitude } : null,
          totalAcceleration: totalAcceleration.toFixed(2),
          timestamp: timestamp ? new Date(parseInt(timestamp)) : new Date()
        }
      });
      await fallActivity.save();
      console.log('⚠️ Fall detected! Total acceleration:', totalAcceleration.toFixed(2));
    }

    // Check for rapid rotation (potential emergency)
    if (totalRotation > 200) {
      emergencyTriggered = true;

      const emergencyActivity = new Activity({
        userId: user._id,
        type: 'emergency',
        message: `Rapid movement detected! Total rotation: ${totalRotation.toFixed(2)}°/s`,
        status: 'error',
        metadata: {
          deviceId: 'ESP32_001',
          accelerometer: { x: accX, y: accY, z: accZ },
          gyroscope: { x: gyroX, y: gyroY, z: gyroZ },
          location: latitude && longitude ? { latitude, longitude } : null,
          totalRotation: totalRotation.toFixed(2),
          timestamp: timestamp ? new Date(parseInt(timestamp)) : new Date()
        }
      });
      await emergencyActivity.save();
      console.log('🚨 Emergency detected! Total rotation:', totalRotation.toFixed(2));
    }

    // Create sync activity
    const syncActivity = new Activity({
      userId: user._id,
      type: 'sync',
      message: 'ESP32 sensor data received',
      status: 'success',
      metadata: {
        deviceId: 'ESP32_001',
        accelerometer: { x: accX, y: accY, z: accZ },
        gyroscope: { x: gyroX, y: gyroY, z: gyroZ },
        location: latitude && longitude ? { latitude, longitude } : null,
        heartRate,
        temperature,
        batteryLevel,
        timestamp: timestamp ? new Date(parseInt(timestamp)) : new Date()
      }
    });

    try {
      await syncActivity.save();
      console.log('📝 Activity record created successfully');
    } catch (activityError) {
      console.error('❌ Error creating activity record:', activityError.message);
    }

    const response = {
      status: 'success',
      message: 'ESP32 data received and saved successfully',
      dataId: savedSensorData._id,
      analysis: {
        totalAcceleration: totalAcceleration.toFixed(2) + 'g',
        totalRotation: totalRotation.toFixed(2) + '°/s',
        fallDetected,
        emergencyTriggered,
        location: latitude && longitude ? { latitude, longitude } : null,
        heartRate: heartRate || null,
        temperature: temperature || null,
        batteryLevel: batteryLevel || null
      },
      timestamp: new Date().toISOString()
    };

    console.log('🎉 ESP32 DATA PROCESSING COMPLETE!');
    console.log('📤 Sending response:', JSON.stringify(response, null, 2));
    console.log('=== END ESP32 DATA PROCESSING ===\n');

    res.status(200).json(response);

  } catch (error) {
    console.error('❌ ESP32 data processing error:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to process ESP32 data',
      error: error.message
    });
  }
});

// Receive sensor data from device (no auth required for device)
app.post('/api/sensor/data', async (req, res) => {
  try {
    const {
      deviceId,
      userId,
      heartRate,
      temperature,
      accelerometer,
      gyroscope,
      location,
      batteryLevel,
      emergencyTriggered,
      fallDetected,
      timestamp
    } = req.body;

    // Validate required fields
    if (!deviceId) {
      return res.status(400).json({ message: 'Device ID is required' });
    }

    // Find user by deviceId or userId
    let user;
    if (userId) {
      user = await User.findById(userId);
    } else {
      // You might want to add a deviceId field to User schema for this
      user = await User.findOne({ phone: deviceId }); // Temporary mapping
    }

    if (!user) {
      return res.status(404).json({ message: 'User not found for this device' });
    }

    // Create sensor data entry
    const sensorData = new SensorData({
      userId: user._id,
      deviceId,
      heartRate,
      temperature,
      accelerometer,
      gyroscope,
      location,
      batteryLevel,
      emergencyTriggered,
      fallDetected,
      timestamp: timestamp ? new Date(timestamp) : new Date()
    });

    await sensorData.save();

    // Check for emergency conditions and create activities
    const activities = [];

    if (emergencyTriggered) {
      const emergencyActivity = new Activity({
        userId: user._id,
        type: 'emergency',
        message: 'Emergency button pressed on device',
        status: 'error',
        metadata: { deviceId, location, timestamp: sensorData.timestamp }
      });
      await emergencyActivity.save();
      activities.push('emergency_triggered');
    }

    if (fallDetected) {
      const fallActivity = new Activity({
        userId: user._id,
        type: 'emergency',
        message: 'Fall detected by device sensors',
        status: 'warning',
        metadata: { deviceId, accelerometer, gyroscope, location, timestamp: sensorData.timestamp }
      });
      await fallActivity.save();
      activities.push('fall_detected');
    }

    // Check for abnormal vital signs
    if (heartRate && (heartRate > 120 || heartRate < 50)) {
      const vitalActivity = new Activity({
        userId: user._id,
        type: 'system',
        message: `Abnormal heart rate detected: ${heartRate} BPM`,
        status: heartRate > 150 ? 'error' : 'warning',
        metadata: { deviceId, heartRate, timestamp: sensorData.timestamp }
      });
      await vitalActivity.save();
      activities.push('abnormal_vitals');
    }

    if (temperature && (temperature > 38 || temperature < 35)) {
      const tempActivity = new Activity({
        userId: user._id,
        type: 'system',
        message: `Abnormal body temperature: ${temperature}°C`,
        status: 'warning',
        metadata: { deviceId, temperature, timestamp: sensorData.timestamp }
      });
      await tempActivity.save();
      activities.push('abnormal_temperature');
    }

    // Low battery warning
    if (batteryLevel && batteryLevel < 20) {
      const batteryActivity = new Activity({
        userId: user._id,
        type: 'system',
        message: `Low battery warning: ${batteryLevel}%`,
        status: batteryLevel < 10 ? 'error' : 'warning',
        metadata: { deviceId, batteryLevel, timestamp: sensorData.timestamp }
      });
      await batteryActivity.save();
      activities.push('low_battery');
    }

    res.status(201).json({
      message: 'Sensor data received successfully',
      dataId: sensorData._id,
      activitiesTriggered: activities,
      timestamp: sensorData.timestamp
    });

  } catch (error) {
    console.error('Sensor data error:', error.message);
    res.status(500).json({ message: 'Failed to process sensor data' });
  }
});

// Get latest sensor data for user
app.get('/api/sensor/latest', auth, async (req, res) => {
  try {
    const latestData = await SensorData.findOne({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(1);

    if (!latestData) {
      return res.status(404).json({ message: 'No sensor data found' });
    }

    res.json(latestData);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get sensor data history
app.get('/api/sensor/history', auth, async (req, res) => {
  try {
    const { limit = 50, skip = 0, startDate, endDate } = req.query;

    let query = { userId: req.user.id };

    // Add date range filter if provided
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const sensorData = await SensorData.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    const total = await SensorData.countDocuments(query);

    res.json({
      data: sensorData,
      total,
      hasMore: (parseInt(skip) + parseInt(limit)) < total
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get sensor data analytics
app.get('/api/sensor/analytics', auth, async (req, res) => {
  try {
    const { period = '24h' } = req.query;

    // Calculate date range based on period
    const now = new Date();
    let startDate;

    switch (period) {
      case '1h':
        startDate = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    const analytics = await SensorData.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(req.user.id),
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          avgHeartRate: { $avg: '$heartRate' },
          maxHeartRate: { $max: '$heartRate' },
          minHeartRate: { $min: '$heartRate' },
          avgTemperature: { $avg: '$temperature' },
          maxTemperature: { $max: '$temperature' },
          minTemperature: { $min: '$temperature' },
          avgBatteryLevel: { $avg: '$batteryLevel' },
          emergencyCount: { $sum: { $cond: ['$emergencyTriggered', 1, 0] } },
          fallCount: { $sum: { $cond: ['$fallDetected', 1, 0] } },
          totalReadings: { $sum: 1 }
        }
      }
    ]);

    const result = analytics[0] || {
      avgHeartRate: 0,
      maxHeartRate: 0,
      minHeartRate: 0,
      avgTemperature: 0,
      maxTemperature: 0,
      minTemperature: 0,
      avgBatteryLevel: 0,
      emergencyCount: 0,
      fallCount: 0,
      totalReadings: 0
    };

    res.json({
      period,
      analytics: result,
      dateRange: { startDate, endDate: now }
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// WhatsApp Routes

// Get WhatsApp connection status
app.get('/api/whatsapp/status', auth, async (req, res) => {
  try {
    const status = whatsappService.getConnectionStatus();
    res.json(status);
  } catch (error) {
    console.error('Error getting WhatsApp status:', error);
    res.status(500).json({ message: 'Failed to get WhatsApp status' });
  }
});

// Initialize WhatsApp connection
app.post('/api/whatsapp/connect', auth, async (req, res) => {
  try {
    const result = await whatsappService.initialize();
    if (result) {
      res.json({ message: 'WhatsApp initialization started', success: true });
    } else {
      res.status(500).json({ message: 'Failed to initialize WhatsApp', success: false });
    }
  } catch (error) {
    console.error('Error initializing WhatsApp:', error);
    res.status(500).json({ message: 'Failed to initialize WhatsApp' });
  }
});

// Disconnect WhatsApp
app.post('/api/whatsapp/disconnect', auth, async (req, res) => {
  try {
    await whatsappService.disconnect();
    res.json({ message: 'WhatsApp disconnected successfully', success: true });
  } catch (error) {
    console.error('Error disconnecting WhatsApp:', error);
    res.status(500).json({ message: 'Failed to disconnect WhatsApp' });
  }
});

// Voice-activated SOS endpoint
app.post('/api/emergency/voice-sos', auth, async (req, res) => {
  try {
    const { trigger, audioLevel, timestamp } = req.body;

    // Get user with emergency contacts
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.emergencyContacts || user.emergencyContacts.length === 0) {
      return res.status(400).json({ message: 'No emergency contacts configured' });
    }

    // Check WhatsApp connection
    const whatsappStatus = whatsappService.getConnectionStatus();
    if (!whatsappStatus.isConnected) {
      return res.status(503).json({
        message: 'WhatsApp is not connected. Please connect WhatsApp first.',
        whatsappStatus
      });
    }

    // Get current location from latest sensor data
    const latestSensorData = await SensorData.findOne({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(1);

    let locationText = '';
    let latitude = null;
    let longitude = null;

    if (latestSensorData && latestSensorData.location) {
      latitude = latestSensorData.location.latitude;
      longitude = latestSensorData.location.longitude;
      locationText = `\n📍 Location: https://maps.google.com/maps?q=${latitude},${longitude}`;
    }

    // Create SOS message
    const sosMessage = `🚨 EMERGENCY ALERT 🚨

${user.name} needs immediate help!

⚠️ Voice-activated SOS triggered
🔊 Audio level: ${audioLevel}/255
⏰ Time: ${new Date(timestamp).toLocaleString()}
📱 Trigger: ${trigger === 'voice_scream' ? 'Loud scream detected' : 'Manual trigger'}${locationText}

This is an automated emergency message from Smart Safety Band.

Please contact ${user.name} immediately or call emergency services if needed.`;

    // Send WhatsApp messages to all emergency contacts
    const results = [];
    const errors = [];

    for (const contact of user.emergencyContacts) {
      try {
        console.log(`📤 Sending SOS WhatsApp to ${contact.name} (${contact.phone})`);

        // Send text message
        const textResult = await whatsappService.sendMessage(contact.phone, sosMessage);

        // Send location if available
        if (latitude && longitude) {
          await whatsappService.sendLocationMessage(
            contact.phone,
            latitude,
            longitude,
            `🚨 ${user.name}'s emergency location`
          );
        }

        results.push({
          contact: `${contact.name} (${contact.phone})`,
          status: 'sent',
          messageId: textResult.messageId,
          timestamp: textResult.timestamp
        });

        console.log(`✅ SOS sent to ${contact.name}`);
      } catch (error) {
        console.error(`❌ Failed to send SOS to ${contact.name}:`, error);
        errors.push({
          contact: `${contact.name} (${contact.phone})`,
          error: error.message
        });
      }
    }

    // Create activity log
    const activity = new Activity({
      userId: req.user.id,
      type: 'emergency',
      message: `Voice-activated SOS sent via WhatsApp to ${results.length} contacts`,
      status: results.length > 0 ? 'success' : 'error',
      metadata: {
        trigger,
        audioLevel,
        contactsNotified: results.length,
        totalContacts: user.emergencyContacts.length,
        location: latitude && longitude ? { latitude, longitude } : null,
        timestamp
      }
    });
    await activity.save();

    const response = {
      success: results.length > 0,
      message: results.length > 0
        ? `SOS sent successfully to ${results.length}/${user.emergencyContacts.length} contacts`
        : 'Failed to send SOS to any contacts',
      results,
      errors,
      summary: {
        totalContacts: user.emergencyContacts.length,
        successful: results.length,
        failed: errors.length
      },
      whatsappUsed: true
    };

    res.json(response);

  } catch (error) {
    console.error('Voice SOS error:', error);
    res.status(500).json({
      message: 'Failed to send voice-activated SOS',
      error: error.message
    });
  }
});

// Enhanced location sharing with WhatsApp
app.post('/api/emergency/share-location-whatsapp', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.emergencyContacts || user.emergencyContacts.length === 0) {
      return res.status(400).json({ message: 'No emergency contacts configured' });
    }

    // Check WhatsApp connection
    const whatsappStatus = whatsappService.getConnectionStatus();
    if (!whatsappStatus.isConnected) {
      return res.status(503).json({
        message: 'WhatsApp is not connected. Please connect WhatsApp first.',
        whatsappStatus
      });
    }

    // Get latest location from sensor data
    const latestSensorData = await SensorData.findOne({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(1);

    if (!latestSensorData || !latestSensorData.location) {
      return res.status(404).json({ message: 'No location data available' });
    }

    const { latitude, longitude } = latestSensorData.location;

    const locationMessage = `📍 Location Shared by ${user.name}

🕐 Time: ${new Date().toLocaleString()}
📱 Shared from Smart Safety Band

Google Maps: https://maps.google.com/maps?q=${latitude},${longitude}

This location was shared intentionally by ${user.name}.`;

    // Send to all emergency contacts
    const results = [];
    const errors = [];

    for (const contact of user.emergencyContacts) {
      try {
        // Send location
        await whatsappService.sendLocationMessage(contact.phone, latitude, longitude, locationMessage);

        results.push({
          contact: `${contact.name} (${contact.phone})`,
          status: 'sent'
        });

        console.log(`✅ Location shared with ${contact.name} via WhatsApp`);
      } catch (error) {
        console.error(`❌ Failed to share location with ${contact.name}:`, error);
        errors.push({
          contact: `${contact.name} (${contact.phone})`,
          error: error.message
        });
      }
    }

    // Create activity log
    const activity = new Activity({
      userId: req.user.id,
      type: 'location',
      message: `Location shared via WhatsApp to ${results.length} contacts`,
      status: results.length > 0 ? 'success' : 'error',
      metadata: {
        location: { latitude, longitude },
        contactsNotified: results.length,
        totalContacts: user.emergencyContacts.length,
        method: 'whatsapp'
      }
    });
    await activity.save();

    res.json({
      success: results.length > 0,
      message: `Location shared via WhatsApp to ${results.length}/${user.emergencyContacts.length} contacts`,
      results,
      errors,
      summary: {
        totalContacts: user.emergencyContacts.length,
        successful: results.length,
        failed: errors.length
      },
      location: { latitude, longitude }
    });

  } catch (error) {
    console.error('WhatsApp location sharing error:', error);
    res.status(500).json({
      message: 'Failed to share location via WhatsApp',
      error: error.message
    });
  }
});

// Seed sample sensor data
const seedSensorData = async () => {
  try {
    // Find or create demo user
    let user = await User.findOne({ email: 'rahul.sharma@smartsafetyband.com' });

    if (!user) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('demo123', salt);

      user = new User({
        name: 'Rahul Sharma',
        email: 'rahul.sharma@smartsafetyband.com',
        phone: '+91 98765 43210',
        password: hashedPassword,
        emergencyContacts: [
          { id: '1', name: 'Sunita Sharma', phone: '+91 98765 43211', relationship: 'Mother' },
          { id: '2', name: 'Amit Kumar', phone: '+91 87654 32109', relationship: 'Friend' },
          { id: '3', name: 'Emergency Services', phone: '112', relationship: 'Emergency' }
        ]
      });

      await user.save();
      console.log('✅ Created demo user for seeding');
    }

    // Clear existing sensor data
    await SensorData.deleteMany({});
    console.log('🧹 Cleared existing sensor data');

    // Create 2 sample sensor records
    const sampleData = [
      {
        userId: user._id,
        deviceId: 'ESP32_001',
        accelerometer: { x: 1.2, y: -0.8, z: 9.6 },
        gyroscope: { x: 15.3, y: -8.7, z: 12.1 },
        location: { latitude: 28.6139, longitude: 77.2090, accuracy: 8 },
        heartRate: 72,
        temperature: 36.8,
        batteryLevel: 85,
        emergencyTriggered: false,
        fallDetected: false,
        timestamp: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
        createdAt: new Date(Date.now() - 5 * 60 * 1000)
      },
      {
        userId: user._id,
        deviceId: 'ESP32_001',
        accelerometer: { x: 0.9, y: -1.1, z: 9.8 },
        gyroscope: { x: 8.2, y: -12.5, z: 6.8 },
        location: { latitude: 28.6141, longitude: 77.2088, accuracy: 12 },
        heartRate: 75,
        temperature: 36.9,
        batteryLevel: 84,
        emergencyTriggered: false,
        fallDetected: false,
        timestamp: new Date(Date.now() - 2 * 60 * 1000), // 2 minutes ago
        createdAt: new Date(Date.now() - 2 * 60 * 1000)
      }
    ];

    const savedData = await SensorData.insertMany(sampleData);
    console.log('🌱 Seeded 2 sample sensor records:', savedData.map(d => d._id));

    // Create corresponding activities
    const activities = [
      {
        userId: user._id,
        type: 'sync',
        message: 'ESP32 sensor data received (Sample 1)',
        status: 'success',
        metadata: {
          deviceId: 'ESP32_001',
          accelerometer: sampleData[0].accelerometer,
          gyroscope: sampleData[0].gyroscope,
          location: sampleData[0].location,
          timestamp: sampleData[0].timestamp
        },
        createdAt: sampleData[0].createdAt
      },
      {
        userId: user._id,
        type: 'sync',
        message: 'ESP32 sensor data received (Sample 2)',
        status: 'success',
        metadata: {
          deviceId: 'ESP32_001',
          accelerometer: sampleData[1].accelerometer,
          gyroscope: sampleData[1].gyroscope,
          location: sampleData[1].location,
          timestamp: sampleData[1].timestamp
        },
        createdAt: sampleData[1].createdAt
      }
    ];

    await Activity.insertMany(activities);
    console.log('📝 Created corresponding activity records');

    return { success: true, count: savedData.length, records: savedData };
  } catch (error) {
    console.error('❌ Error seeding sensor data:', error);
    throw error;
  }
};

// Seed endpoint
app.post('/api/sensor/seed', async (req, res) => {
  try {
    const result = await seedSensorData();
    res.json({
      message: 'Successfully seeded sensor data',
      ...result
    });
  } catch (error) {
    console.error('Seed endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint to check sensor data in database (remove in production)
app.get('/api/sensor/debug', async (req, res) => {
  try {
    const count = await SensorData.countDocuments();
    const latest = await SensorData.findOne().sort({ createdAt: -1 });
    const all = await SensorData.find().sort({ createdAt: -1 }).limit(10);

    res.json({
      totalCount: count,
      latestRecord: latest,
      recent10Records: all,
      databaseState: mongoose.connection.readyState,
      databaseName: mongoose.connection.name
    });
  } catch (error) {
    console.error('Debug endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get dashboard sensor data summary
app.get('/api/sensor/dashboard', auth, async (req, res) => {
  try {
    // Get latest sensor data
    const latestData = await SensorData.findOne({
      deviceId: { $in: ['ESP32_001', 'TEST_DEVICE'] }
    })
      .sort({ createdAt: -1 })
      .populate('userId', 'name email');

    // Get recent sensor data (last 10 readings)
    const recentData = await SensorData.find({
      deviceId: { $in: ['ESP32_001', 'TEST_DEVICE'] }
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('userId', 'name email');

    // Calculate statistics for the last 30 minutes
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const stats = await SensorData.aggregate([
      {
        $match: {
          deviceId: { $in: ['ESP32_001', 'TEST_DEVICE'] },
          createdAt: { $gte: thirtyMinutesAgo }
        }
      },
      {
        $group: {
          _id: null,
          totalReadings: { $sum: 1 },
          emergencyCount: { $sum: { $cond: ['$emergencyTriggered', 1, 0] } },
          fallCount: { $sum: { $cond: ['$fallDetected', 1, 0] } },
          avgHeartRate: { $avg: '$heartRate' },
          avgTemperature: { $avg: '$temperature' },
          avgBatteryLevel: { $avg: '$batteryLevel' }
        }
      }
    ]);

    const summary = stats[0] || {
      totalReadings: 0,
      emergencyCount: 0,
      fallCount: 0,
      avgHeartRate: null,
      avgTemperature: null,
      avgBatteryLevel: null
    };

    res.json({
      latest: latestData ? {
        id: latestData._id,
        timestamp: latestData.createdAt,
        deviceId: latestData.deviceId,
        accelerometer: latestData.accelerometer,
        gyroscope: latestData.gyroscope,
        location: latestData.location,
        heartRate: latestData.heartRate,
        temperature: latestData.temperature,
        batteryLevel: latestData.batteryLevel,
        emergencyTriggered: latestData.emergencyTriggered,
        fallDetected: latestData.fallDetected,
        totalAcceleration: latestData.accelerometer ?
          Math.sqrt(latestData.accelerometer.x ** 2 + latestData.accelerometer.y ** 2 + latestData.accelerometer.z ** 2) : null,
        totalRotation: latestData.gyroscope ?
          Math.sqrt(latestData.gyroscope.x ** 2 + latestData.gyroscope.y ** 2 + latestData.gyroscope.z ** 2) : null
      } : null,
      recent: recentData.map(data => ({
        id: data._id,
        timestamp: data.createdAt,
        deviceId: data.deviceId,
        status: data.emergencyTriggered ? 'emergency' : data.fallDetected ? 'fall' : 'normal',
        totalAcceleration: data.accelerometer ?
          Math.sqrt(data.accelerometer.x ** 2 + data.accelerometer.y ** 2 + data.accelerometer.z ** 2) : null,
        totalRotation: data.gyroscope ?
          Math.sqrt(data.gyroscope.x ** 2 + data.gyroscope.y ** 2 + data.gyroscope.z ** 2) : null
      })),
      summary,
      dataRetentionInfo: {
        retentionPeriod: '30 minutes',
        nextCleanup: 'Every 5 minutes',
        message: 'Sensor data is automatically deleted after 30 minutes'
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard sensor data:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all ESP32 sensor data for recent activity
app.get('/api/sensor/esp32/recent', auth, async (req, res) => {
  try {
    const { limit = 50, skip = 0 } = req.query;

    // Get all sensor data from ESP32 devices
    const sensorData = await SensorData.find({
      deviceId: { $in: ['ESP32_001', 'TEST_DEVICE'] }
    })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .populate('userId', 'name email');

    const total = await SensorData.countDocuments({
      deviceId: { $in: ['ESP32_001', 'TEST_DEVICE'] }
    });

    // Format the data for recent activity display
    const formattedData = sensorData.map(data => ({
      id: data._id,
      timestamp: data.createdAt,
      deviceId: data.deviceId,
      user: data.userId ? {
        name: data.userId.name,
        email: data.userId.email
      } : null,
      accelerometer: data.accelerometer,
      gyroscope: data.gyroscope,
      location: data.location,
      heartRate: data.heartRate,
      temperature: data.temperature,
      batteryLevel: data.batteryLevel,
      emergencyTriggered: data.emergencyTriggered,
      fallDetected: data.fallDetected,
      // Calculate derived values
      totalAcceleration: data.accelerometer ?
        Math.sqrt(data.accelerometer.x ** 2 + data.accelerometer.y ** 2 + data.accelerometer.z ** 2) : null,
      totalRotation: data.gyroscope ?
        Math.sqrt(data.gyroscope.x ** 2 + data.gyroscope.y ** 2 + data.gyroscope.z ** 2) : null,
      status: data.emergencyTriggered ? 'emergency' :
        data.fallDetected ? 'fall' :
          'normal'
    }));

    res.json({
      data: formattedData,
      total,
      hasMore: (parseInt(skip) + parseInt(limit)) < total,
      summary: {
        totalReadings: total,
        emergencyCount: formattedData.filter(d => d.emergencyTriggered).length,
        fallCount: formattedData.filter(d => d.fallDetected).length,
        devicesActive: [...new Set(formattedData.map(d => d.deviceId))].length
      }
    });
  } catch (error) {
    console.error('Error fetching ESP32 recent data:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Test endpoint to generate fake sensor data with GPS
app.post('/api/sensor/test', async (req, res) => {
  try {
    // Find demo user
    let user = await User.findOne({ email: 'rahul.sharma@smartsafetyband.com' });

    if (!user) {
      return res.status(404).json({ message: 'Demo user not found. Please login first.' });
    }

    // Generate fake sensor data with GPS
    const fakeData = {
      accelerometer: {
        x: (Math.random() - 0.5) * 20, // -10 to 10
        y: (Math.random() - 0.5) * 20,
        z: 9.8 + (Math.random() - 0.5) * 2 // Around 9.8 with variation
      },
      gyroscope: {
        x: (Math.random() - 0.5) * 200, // -100 to 100
        y: (Math.random() - 0.5) * 200,
        z: (Math.random() - 0.5) * 200
      },
      location: {
        latitude: 28.6118372 + (Math.random() - 0.5) * 0.01, // Delhi area
        longitude: 77.0377945 + (Math.random() - 0.5) * 0.01,
        accuracy: Math.floor(Math.random() * 20) + 5 // 5-25 meters
      },
      heartRate: Math.floor(Math.random() * 40) + 60, // 60-100 BPM
      temperature: 36.5 + (Math.random() - 0.5) * 2, // 35.5-37.5°C
      batteryLevel: Math.floor(Math.random() * 100) + 1 // 1-100%
    };

    // Create sensor data entry
    const sensorData = new SensorData({
      userId: user._id,
      deviceId: 'TEST_DEVICE',
      ...fakeData,
      timestamp: new Date()
    });

    await sensorData.save();

    // Create sync activity
    const syncActivity = new Activity({
      userId: user._id,
      type: 'sync',
      message: 'Test sensor data generated with GPS',
      status: 'success',
      metadata: {
        deviceId: 'TEST_DEVICE',
        ...fakeData,
        timestamp: new Date()
      }
    });
    await syncActivity.save();

    res.status(201).json({
      message: 'Test sensor data created successfully',
      data: sensorData,
      fakeData
    });

  } catch (error) {
    console.error('Test data generation error:', error.message);
    res.status(500).json({ message: 'Failed to generate test data' });
  }
});

// Emergency SMS endpoint - Share location with emergency contacts
app.post('/api/emergency/share-location', auth, async (req, res) => {
  try {
    console.log('🚨 Emergency location share request received for user:', req.user.id);

    // Check if Vonage is configured
    if (!vonageClient) {
      console.log('❌ Vonage not configured');
      return res.status(503).json({
        message: 'SMS service is not configured. Please contact administrator.',
        error: 'Vonage credentials not available'
      });
    }

    // Get user with emergency contacts
    const user = await User.findById(req.user.id);
    if (!user) {
      console.log('❌ User not found:', req.user.id);
      return res.status(404).json({ message: 'User not found' });
    }

    console.log('✅ User found:', user.name, 'Emergency contacts:', user.emergencyContacts?.length || 0);

    // Get latest sensor data for location
    const latestSensorData = await SensorData.findOne({ userId: req.user.id })
      .sort({ createdAt: -1 });

    if (!latestSensorData || !latestSensorData.location) {
      console.log('❌ No location data available for user:', req.user.id);
      return res.status(404).json({ message: 'No location data available' });
    }

    console.log('✅ Location data found:', latestSensorData.location);

    const { latitude, longitude } = latestSensorData.location;

    // Create emergency message with coordinates only
    const emergencyMessage = `🚨 EMERGENCY ALERT 🚨\n\n${user.name} has triggered an emergency alert!\n\nLocation Coordinates:\nLatitude: ${latitude}\nLongitude: ${longitude}\n\nTime: ${new Date().toLocaleString()}\n\nPlease check on them immediately!`;

    const results = [];
    const errors = [];

    // Send SMS to all emergency contacts
    for (const contact of user.emergencyContacts) {
      try {
        // Format phone number (ensure it has country code)
        let phoneNumber = contact.phone;
        if (!phoneNumber.startsWith('+')) {
          // Assume Indian number if no country code
          phoneNumber = phoneNumber.replace(/^\+?91/, '+91');
          if (!phoneNumber.startsWith('+91')) {
            phoneNumber = '+91' + phoneNumber.replace(/\D/g, '');
          }
        }

        const response = await vonageClient.sms.send({
          to: phoneNumber,
          from: VONAGE_FROM_NUMBER,
          text: emergencyMessage
        });

        results.push({
          contact: contact.name,
          phone: phoneNumber,
          status: 'sent',
          messageId: response.messages[0]['message-id']
        });

        console.log(`✅ Emergency SMS sent to ${contact.name} (${phoneNumber}): ${response.messages[0]['message-id']}`);

      } catch (smsError) {
        console.error(`❌ Failed to send SMS to ${contact.name} (${contact.phone}):`, smsError.message);
        errors.push({
          contact: contact.name,
          phone: contact.phone,
          error: smsError.message
        });
      }
    }

    // Log emergency action
    const emergencyLog = new Activity({
      userId: req.user.id,
      type: 'emergency',
      message: 'Emergency location shared with contacts',
      status: results.length > 0 ? 'success' : 'failed',
      metadata: {
        location: { latitude, longitude },
        contactsNotified: results.length,
        totalContacts: user.emergencyContacts.length,
        results,
        errors
      }
    });
    await emergencyLog.save();

    res.json({
      message: 'Emergency location sharing completed',
      location: { latitude, longitude },
      results,
      errors,
      summary: {
        totalContacts: user.emergencyContacts.length,
        successful: results.length,
        failed: errors.length
      }
    });

  } catch (error) {
    console.error('🚨 Emergency SMS error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      message: 'Failed to send emergency SMS',
      error: error.message
    });
  }
});

// Test emergency endpoint - Simulates SMS sending without Vonage
app.post('/api/emergency/share-location-test', auth, async (req, res) => {
  try {
    console.log('🧪 Test emergency location share request received for user:', req.user.id);

    // Get user with emergency contacts
    const user = await User.findById(req.user.id);
    if (!user) {
      console.log('❌ User not found:', req.user.id);
      return res.status(404).json({ message: 'User not found' });
    }

    console.log('✅ User found:', user.name, 'Emergency contacts:', user.emergencyContacts?.length || 0);

    // Get latest sensor data for location
    const latestSensorData = await SensorData.findOne({ userId: req.user.id })
      .sort({ createdAt: -1 });

    if (!latestSensorData || !latestSensorData.location) {
      console.log('❌ No location data available for user:', req.user.id);
      return res.status(404).json({ message: 'No location data available' });
    }

    console.log('✅ Location data found:', latestSensorData.location);

    const { latitude, longitude } = latestSensorData.location;

    // Create emergency message with coordinates only
    const emergencyMessage = `🚨 EMERGENCY ALERT 🚨\n\n${user.name} has triggered an emergency alert!\n\nLocation Coordinates:\nLatitude: ${latitude}\nLongitude: ${longitude}\n\nTime: ${new Date().toLocaleString()}\n\nPlease check on them immediately!`;

    const results = [];
    const errors = [];

    // Simulate SMS sending to all emergency contacts
    for (const contact of user.emergencyContacts) {
      try {
        // Format phone number (ensure it has country code)
        let phoneNumber = contact.phone;
        if (!phoneNumber.startsWith('+')) {
          // Assume Indian number if no country code
          phoneNumber = phoneNumber.replace(/^\+?91/, '+91');
          if (!phoneNumber.startsWith('+91')) {
            phoneNumber = '+91' + phoneNumber.replace(/\D/g, '');
          }
        }

        // Simulate SMS sending (no actual SMS sent)
        const mockMessageSid = `SM${Math.random().toString(36).substr(2, 32)}`;

        results.push({
          contact: contact.name,
          phone: phoneNumber,
          status: 'simulated',
          messageSid: mockMessageSid
        });

        console.log(`✅ [SIMULATED] Emergency SMS sent to ${contact.name} (${phoneNumber}): ${mockMessageSid}`);

      } catch (smsError) {
        console.error(`❌ Failed to simulate SMS to ${contact.name} (${contact.phone}):`, smsError.message);
        errors.push({
          contact: contact.name,
          phone: contact.phone,
          error: smsError.message
        });
      }
    }

    // Log emergency action
    const emergencyLog = new Activity({
      userId: req.user.id,
      type: 'emergency',
      message: 'Emergency location shared with contacts (TEST MODE)',
      status: results.length > 0 ? 'success' : 'failed',
      metadata: {
        location: { latitude, longitude },
        contactsNotified: results.length,
        totalContacts: user.emergencyContacts.length,
        results,
        errors,
        note: 'Test mode - no actual SMS sent'
      }
    });
    await emergencyLog.save();

    res.json({
      message: 'Emergency location sharing completed (TEST MODE - No actual SMS sent)',
      location: { latitude, longitude },
      results,
      errors,
      summary: {
        totalContacts: user.emergencyContacts.length,
        successful: results.length,
        failed: errors.length
      },
      testMode: true
    });

  } catch (error) {
    console.error('🧪 Test emergency SMS error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      message: 'Failed to send test emergency SMS',
      error: error.message
    });
  }
});

// Demo login endpoint for testing
app.post('/api/users/demo-login', async (req, res) => {
  try {
    // Create or find demo user
    let user = await User.findOne({ email: 'rahul.sharma@smartsafetyband.com' });

    if (!user) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('demo123', salt);

      user = new User({
        name: 'Rahul Sharma',
        email: 'rahul.sharma@smartsafetyband.com',
        phone: '+91 98765 43210',
        password: hashedPassword,
        emergencyContacts: [
          { id: '1', name: 'Sunita Sharma', phone: '+91 98765 43211', relationship: 'Mother' },
          { id: '2', name: 'Amit Kumar', phone: '+91 87654 32109', relationship: 'Friend' },
          { id: '3', name: 'Emergency Services', phone: '112', relationship: 'Emergency' }
        ]
      });

      await user.save();
    }

    // Create JWT token
    const payload = {
      user: {
        id: user.id
      }
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' },
      (err, token) => {
        if (err) throw err;
        res.json({
          token,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            emergencyContacts: user.emergencyContacts
          }
        });
      }
    );
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Health check endpoint for Render
app.get('/', (req, res) => {
  res.json({
    message: 'Smart Safety Band API is running!',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Catch-all route for undefined endpoints
app.use('*', (req, res) => {
  res.status(404).json({
    message: 'Route not found',
    availableRoutes: [
      'GET /',
      'GET /health',
      'POST /api/users/register',
      'POST /api/users/login',
      'POST /api/users/demo-login',
      'GET /api/users/profile',
      'PUT /api/users/profile',
      'GET /api/activities',
      'POST /api/activities',
      'GET /api/activities/stats',
      'POST /receive',
      'POST /api/sensor/data',
      'GET /api/sensor/latest',
      'GET /api/sensor/history',
      'GET /api/sensor/analytics'
    ]
  });
});

// Auto-delete sensor data older than 30 minutes
const cleanupOldSensorData = async () => {
  try {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const result = await SensorData.deleteMany({
      createdAt: { $lt: thirtyMinutesAgo }
    });

    if (result.deletedCount > 0) {
      console.log(`🧹 Cleaned up ${result.deletedCount} old sensor data records`);
    }
  } catch (error) {
    console.error('❌ Error cleaning up sensor data:', error.message);
  }
};

// Run cleanup every 5 minutes
setInterval(cleanupOldSensorData, 5 * 60 * 1000);

// Connect to database and start server
const startServer = async () => {
  try {
    console.log('🚀 Starting Smart SafetyBand API...');
    console.log('📊 Environment:', process.env.NODE_ENV || 'development');

    // Connect to MongoDB
    await connectDB();

    // Initialize WhatsApp service
    console.log('📱 Initializing WhatsApp service...');
    whatsappService.initialize().catch(error => {
      console.error('⚠️ WhatsApp service failed to initialize:', error.message);
      console.log('📱 WhatsApp features will be unavailable until manually connected');
    });

    // Seed sample data on startup
    console.log('🌱 Seeding sample sensor data...');
    try {
      await seedSensorData();
      console.log('✅ Sample data seeded successfully');
    } catch (seedError) {
      console.error('⚠️ Warning: Could not seed sample data:', seedError.message);
    }

    // Start the server
    const PORT = process.env.PORT || 5001;
    const HOST = process.env.HOST || '0.0.0.0';

    const server = app.listen(PORT, HOST, () => {
      console.log(`✅ Server running on ${HOST}:${PORT}`);
      console.log(`🌐 Health check: http://${HOST}:${PORT}/health`);
      console.log(`📡 API Base URL: http://${HOST}:${PORT}/api`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, shutting down gracefully');
      server.close(() => {
        mongoose.connection.close();
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();