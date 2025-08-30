const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// User Schema (same as in server.js)
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

// Activity Schema (same as in server.js)
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

// Sample users data with Indian names and phone numbers
const sampleUsers = [
    {
        name: 'Rahul Sharma',
        email: 'rahul.sharma@smartsafetyband.com',
        phone: '+91 98765 43210',
        password: 'demo123',
        emergencyContacts: [
            { id: '1', name: 'Sunita Sharma', phone: '+91 98765 43211', relationship: 'Mother' },
            { id: '2', name: 'Amit Kumar', phone: '+91 87654 32109', relationship: 'Friend' },
            { id: '3', name: 'Emergency Services', phone: '112', relationship: 'Emergency' }
        ]
    }
];

// Function to seed the database
const seedDatabase = async () => {
    try {
        // Connect to MongoDB
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB Atlas');

        // Clear existing users (optional - remove this line if you want to keep existing data)
        console.log('Clearing existing users...');
        await User.deleteMany({});
        console.log('✅ Cleared existing users');

        // Hash passwords and create users
        console.log('Creating sample users...');
        const usersToInsert = [];

        for (const userData of sampleUsers) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(userData.password, salt);

            usersToInsert.push({
                ...userData,
                password: hashedPassword
            });
        }

        // Insert users into database
        const insertedUsers = await User.insertMany(usersToInsert);
        console.log(`✅ Successfully created ${insertedUsers.length} users`);

        // Create sample activities for the user
        console.log('Creating sample activities...');
        const userId = insertedUsers[0]._id;
        
        const sampleActivities = [
            {
                userId,
                type: 'sync',
                message: 'Device synced successfully',
                status: 'success',
                createdAt: new Date(Date.now() - 2 * 60 * 1000) // 2 minutes ago
            },
            {
                userId,
                type: 'location',
                message: 'Location shared with emergency contacts',
                status: 'success',
                createdAt: new Date(Date.now() - 60 * 60 * 1000) // 1 hour ago
            },
            {
                userId,
                type: 'emergency',
                message: 'Emergency test completed successfully',
                status: 'success',
                createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000) // 3 hours ago
            },
            {
                userId,
                type: 'sync',
                message: 'Device synced successfully',
                status: 'success',
                createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000) // 6 hours ago
            },
            {
                userId,
                type: 'system',
                message: 'Profile information updated',
                status: 'success',
                createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000) // 8 hours ago
            },
            {
                userId,
                type: 'location',
                message: 'Location tracking enabled',
                status: 'success',
                createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000) // 12 hours ago
            },
            {
                userId,
                type: 'emergency',
                message: 'Emergency contact updated',
                status: 'success',
                createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000) // 1 day ago
            },
            {
                userId,
                type: 'sync',
                message: 'Device connection restored',
                status: 'success',
                createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000) // 1 day ago
            },
            {
                userId,
                type: 'system',
                message: 'Device firmware updated',
                status: 'success',
                createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) // 2 days ago
            },
            {
                userId,
                type: 'location',
                message: 'Geofence alert: Left safe zone',
                status: 'warning',
                createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) // 3 days ago
            },
            {
                userId,
                type: 'emergency',
                message: 'SOS test performed successfully',
                status: 'success',
                createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) // 4 days ago
            }
        ];

        // Clear existing activities
        await Activity.deleteMany({});
        
        // Insert sample activities
        const insertedActivities = await Activity.insertMany(sampleActivities);
        console.log(`✅ Successfully created ${insertedActivities.length} activities`);

        // Display created users (without passwords)
        console.log('\n📋 Created Users:');
        insertedUsers.forEach((user, index) => {
            console.log(`${index + 1}. ${user.name} (${user.email})`);
            console.log(`   Phone: ${user.phone}`);
            console.log(`   Emergency Contacts: ${user.emergencyContacts.length}`);
            console.log(`   Password: ${sampleUsers[index].password} (for testing)`);
            console.log('');
        });

        console.log('🎉 Database seeding completed successfully!');
        console.log('\n🔐 Login Credentials for Testing:');
        console.log('Demo Account: rahul.sharma@smartsafetyband.com / demo123');

    } catch (error) {
        console.error('❌ Error seeding database:', error.message);
    } finally {
        // Close database connection
        await mongoose.connection.close();
        console.log('📡 Database connection closed');
        process.exit(0);
    }
};

// Run the seeding function
seedDatabase();