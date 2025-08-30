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

### Core Framework & Runtime
- **Node.js** (>=14.0.0) - JavaScript runtime environment
- **Express.js** (^4.18.2) - Fast, unopinionated web framework for Node.js

### Database & ODM
- **MongoDB** - NoSQL document database
- **Mongoose** (^7.5.0) - MongoDB object modeling for Node.js
- **MongoDB Atlas** - Cloud database service (recommended)

### Authentication & Security
- **JSON Web Token (JWT)** (^9.0.2) - Secure token-based authentication
- **bcryptjs** (^2.4.3) - Password hashing library with salt
- **CORS** (^2.8.5) - Cross-Origin Resource Sharing middleware

### Environment & Configuration
- **dotenv** (^16.3.1) - Environment variable loader from .env files

### Development Tools
- **Nodemon** (^3.0.1) - Development server with auto-restart functionality

### Built-in Node.js Modules
- **crypto** - Cryptographic functionality
- **path** - File and directory path utilities
- **fs** - File system operations

### HTTP & Middleware
- **Express middleware stack:**
  - `express.json()` - JSON body parser
  - `express.urlencoded()` - URL-encoded body parser
  - `express.static()` - Static file serving
  - Custom authentication middleware
  - Error handling middleware

### Database Features
- **MongoDB Features Used:**
  - Document-based storage
  - Indexing (unique email constraint)
  - Aggregation pipeline (for activity statistics)
  - Schema validation
  - Automatic timestamps

### Security Implementation
- **Password Security:**
  - bcrypt hashing with salt rounds (10)
  - Password strength validation
- **JWT Security:**
  - Token-based stateless authentication
  - Configurable expiration (24 hours default)
  - Secure token verification
- **API Security:**
  - Protected routes with middleware
  - Input validation and sanitization
  - CORS configuration for cross-origin requests

### API Architecture
- **RESTful API Design**
- **JSON Response Format**
- **HTTP Status Codes**
- **Error Handling Middleware**
- **Request Validation**

### Development Features
- **Hot Reload** - Nodemon for development
- **Environment Configuration** - Separate dev/prod configs
- **Database Seeding** - Sample data generation
- **Logging** - Console logging for development

## 🌐 API Endpoints

### Authentication Routes
- `POST /api/users/register` - Register new user
  - **Body:** `{ name, email, phone, password }`
  - **Response:** JWT token + user data
- `POST /api/users/login` - Login user
  - **Body:** `{ email, password }`
  - **Response:** JWT token + user data
- `POST /api/users/demo-login` - Demo account login
  - **Body:** None
  - **Response:** JWT token + demo user data

### User Management Routes (Protected)
- `GET /api/users/profile` - Get user profile
  - **Headers:** `x-auth-token: JWT_TOKEN`
  - **Response:** User profile data
- `PUT /api/users/profile` - Update user profile
  - **Headers:** `x-auth-token: JWT_TOKEN`
  - **Body:** `{ name?, email?, phone?, emergencyContacts?, currentPassword?, newPassword? }`
  - **Response:** Updated user data

### Activity Routes (Protected)
- `GET /api/activities` - Get user activities
  - **Headers:** `x-auth-token: JWT_TOKEN`
  - **Query Params:** `?type=<activity_type>&limit=<number>&skip=<number>`
  - **Response:** Array of activities
- `POST /api/activities` - Create new activity
  - **Headers:** `x-auth-token: JWT_TOKEN`
  - **Body:** `{ type, message, status }`
  - **Response:** Created activity
- `GET /api/activities/stats` - Get activity statistics
  - **Headers:** `x-auth-token: JWT_TOKEN`
  - **Response:** Activity counts by type

## 🏗️ API Architecture & Patterns

### Design Patterns
- **MVC Pattern** - Model-View-Controller architecture
- **Middleware Pattern** - Express middleware chain
- **Repository Pattern** - Data access abstraction
- **Factory Pattern** - JWT token generation

### HTTP Methods & Status Codes
- **GET** - Retrieve data (200, 404)
- **POST** - Create resources (201, 400, 409)
- **PUT** - Update resources (200, 400, 404)
- **DELETE** - Remove resources (200, 404)

### Request/Response Flow
1. **Request Validation** - Input sanitization
2. **Authentication** - JWT token verification
3. **Authorization** - User permission checks
4. **Business Logic** - Core application logic
5. **Database Operations** - MongoDB queries
6. **Response Formatting** - Consistent JSON structure

### Error Handling
- **Global Error Handler** - Centralized error processing
- **Custom Error Classes** - Specific error types
- **Validation Errors** - Input validation feedback
- **Database Errors** - MongoDB error handling

## 🔐 Environment Variables

Required environment variables:

```env
# Database
MONGODB_URI=your_mongodb_connection_string

# Authentication
JWT_SECRET=your_jwt_secret_key

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