const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();


const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
const connectDB = async () => {
  try {
    // You can replace this with your MongoDB URL later
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/smartsafetyband';
    await mongoose.connect(mongoURI);
    console.log('MongoDB Connected Successfully');
  } catch (error) {
    console.error('MongoDB Connection Error:', error.message);
    process.exit(1);
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

const User = mongoose.model('User', userSchema);
const Activity = mongoose.model('Activity', activitySchema);

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

// Connect to database and start server
connectDB().then(() => {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});