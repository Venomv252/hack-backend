# 🛡️ Smart Safety Band - Backend API

Express.js backend API for the Smart Safety Band application with MongoDB integration.

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- MongoDB Atlas account or local MongoDB
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd smart-safety-band-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory:
   ```env
   MONGODB_URI=your_mongodb_connection_string
   JWT_SECRET=your_jwt_secret_key
   PORT=5000
   ```

4. **Seed the database (optional)**
   ```bash
   npm run seed
   ```

5. **Start the server**
   ```bash
   npm run dev
   ```

## 📜 Available Scripts

- `npm start` - Start the server in production mode
- `npm run dev` - Start the server with nodemon (development)
- `npm run seed` - Seed the database with sample data

## 🔧 Technology Stack

- **Express.js** - Web framework
- **MongoDB/Mongoose** - Database and ODM
- **JWT** - Authentication tokens
- **bcryptjs** - Password hashing
- **CORS** - Cross-origin resource sharing
- **dotenv** - Environment variable management

## 🌐 API Endpoints

### Authentication
- `POST /api/users/register` - Register new user
- `POST /api/users/login` - Login user
- `POST /api/users/demo-login` - Demo account login
- `GET /api/users/profile` - Get user profile (protected)
- `PUT /api/users/profile` - Update user profile (protected)

### Activities
- `GET /api/activities` - Get user activities (protected)
- `POST /api/activities` - Create new activity (protected)
- `GET /api/activities/stats` - Get activity statistics (protected)

## 🔐 Environment Variables

Required environment variables:

```env
# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/smartsafetyband

# Authentication
JWT_SECRET=your-super-secret-jwt-key

# Server
PORT=5000
```

## 📊 Database Schema

### User Schema
```javascript
{
  name: String,
  email: String (unique),
  phone: String,
  password: String (hashed),
  emergencyContacts: [{
    id: String,
    name: String,
    phone: String,
    relationship: String
  }],
  createdAt: Date
}
```

### Activity Schema
```javascript
{
  userId: ObjectId,
  type: String, // 'sync', 'location', 'emergency', 'system'
  message: String,
  status: String, // 'success', 'warning', 'error', 'normal'
  createdAt: Date
}
```

## 🛡️ Security Features

- **Password Hashing**: bcryptjs with salt rounds
- **JWT Authentication**: Secure token-based auth
- **Protected Routes**: Middleware authentication
- **Input Validation**: Request validation and sanitization
- **CORS Configuration**: Controlled cross-origin requests

## 📱 Demo Data

The application includes demo data accessible with:
- **Email:** rahul.sharma@smartsafetyband.com
- **Password:** demo123

## 🚀 Deployment

### Environment Setup
1. Set up MongoDB Atlas cluster
2. Configure environment variables
3. Deploy to your preferred platform (Heroku, Railway, etc.)

### Production Considerations
- Use strong JWT secrets
- Enable MongoDB authentication
- Set up proper logging
- Configure rate limiting
- Use HTTPS in production

## 🔄 API Response Format

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation successful"
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message",
  "details": { ... }
}
```

## 🧪 Testing

### Demo Login
```bash
curl -X POST http://localhost:5000/api/users/demo-login
```

### Get User Profile
```bash
curl -X GET http://localhost:5000/api/users/profile \
  -H "x-auth-token: YOUR_JWT_TOKEN"
```

## 📝 Development Notes

- Server runs on port 5000 by default
- MongoDB connection is established on startup
- JWT tokens expire in 24 hours
- All protected routes require `x-auth-token` header
- CORS is configured for frontend development

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.