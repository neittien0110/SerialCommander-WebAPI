# Serial Commander WebAPI

A RESTful Web API for Serial Commander application built with Node.js, Express.js, and MySQL. This API provides authentication, user management, scenario configuration management, and activity tracking features.

## Features

- 🔐 **Authentication & Authorization**
  - JWT-based authentication
  - Google OAuth 2.0 integration
  - Password reset functionality with email verification
  - Role-based access control (Admin/User)

- 📊 **User Management**
  - User registration and login
  - User profile management
  - User activity tracking and statistics
  - Admin user management tools

- ⚙️ **Scenario Configuration**
  - Create, update, delete scenarios
  - Import/export scenario configurations
  - Share scenarios with share codes
  - Admin approval system for shared configurations

- 📝 **API Documentation**
  - Swagger/OpenAPI documentation
  - Interactive API explorer at `/api-docs`

- 🛠️ **Additional Features**
  - File upload support
  - Email service integration
  - Input validation and sanitization
  - CORS configuration

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MySQL with Sequelize ORM
- **Authentication**: JWT, Passport.js, Google OAuth 2.0
- **Validation**: Express Validator
- **Documentation**: Swagger/OpenAPI
- **Testing**: Jest, Supertest
- **Email**: Nodemailer

## Prerequisites

- Node.js (v14 or higher)
- MySQL (v5.7 or higher)
- npm or yarn

## Installation

1. Clone the repository:
```bash
git clone https://github.com/nguyenhuyenkiohna/SerialCommander-WebAPI.git
cd SerialCommander-WebAPI
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```env
# Database Configuration
DATABASE_ENV=development
DATABASE_USERNAME=your_username
DATABASE_PASSWORD=your_password
DATABASE_NAME=serialcommander_db
DATABASE_HOST=localhost
DATABASE_PORT=3306

# JWT Configuration
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=24h

# Session Configuration
SESSION_SECRET=your_session_secret_key

# Server Configuration
PORT=2999
FRONTEND_URL=http://localhost:5173

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:2999/api/auth/google/callback

# Email Configuration (for password reset)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_email_password
EMAIL_FROM=your_email@gmail.com

# Debug Mode
DEBUG=false
```

4. Run database migrations:
```bash
# Make sure your MySQL database is running and configured
# The application will automatically sync the database schema on startup
```

5. Start the server:
```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

The server will start on `http://0.0.0.0:2999`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - User login
- `GET /api/auth/google` - Initiate Google OAuth login
- `GET /api/auth/google/callback` - Google OAuth callback
- `POST /api/auth/forgot-password` - Request password reset code
- `POST /api/auth/verify-reset-code` - Verify password reset code
- `POST /api/auth/reset-password` - Reset password with code

### User Management
- `GET /api/user/profile` - Get user profile (requires authentication)
- `GET /api/user/activities` - Get user activities (requires authentication)
- `GET /api/user/activities/stats` - Get user activity statistics (requires authentication)
- `POST /api/user/activities` - Create user activity (requires authentication)

### Scenario Configuration
- `POST /scenarios/import` - Import/create a new scenario (requires authentication)
- `GET /scenarios/myscenarios` - Get user's scenarios (requires authentication)
- `GET /scenarios/:scenarioId` - Get scenario by ID (requires authentication)
- `POST /scenarios/update/:scenarioId` - Update scenario (requires authentication)
- `DELETE /scenarios/:scenarioId` - Delete scenario (requires authentication)
- `GET /scenarios/export/:scenarioId` - Export scenario (requires authentication)
- `POST /scenarios/share/:scenarioId` - Share scenario (requires authentication)
- `POST /verify` - Verify scenario share code
- `GET /share/:shareCode` - Get scenario by share code

### Admin
- `GET /admin/shared-configs` - Get all shared configurations (requires admin role)
- `DELETE /admin/shared-configs/:id` - Delete shared configuration (requires admin role)
- `PATCH /admin/shared-configs/:id/approve` - Approve shared configuration (requires admin role)

### File Upload
- `POST /api/upload` - Upload files (requires authentication)

### Documentation
- `GET /api-docs` - Swagger API documentation

## Project Structure

```
SerialCommander-WebAPI/
├── configs/              # Configuration files
│   ├── app.js
│   ├── database.js
│   ├── googleOAuth.js
│   ├── hashing.js
│   ├── jwt.js
│   └── passport.js
├── kernels/              # Core functionality
│   ├── api-docs/         # Swagger documentation
│   ├── hash/             # Hashing utilities
│   ├── middlewares/      # Express middlewares
│   ├── rules/            # Validation rules
│   ├── tests/            # Test utilities
│   └── validations/      # Input validation
├── migrations/           # Database migrations
├── models/               # Sequelize models
│   ├── user.js
│   ├── scenario.js
│   ├── passwordReset.js
│   └── userActivity.js
├── modules/              # Feature modules
│   ├── admin/            # Admin functionality
│   ├── auth/             # Authentication
│   ├── config/           # Scenario configuration
│   └── user/             # User management
├── routes/               # API routes
│   ├── api.js
│   ├── auth.js
│   ├── user.js
│   └── uploadRoutes.js
├── scripts/              # Utility scripts
├── tests/                # Test files
├── utils/                # Utility functions
│   ├── apiUtils.js
│   ├── emailService.js
│   ├── jwtUtils.js
│   ├── responseUtils.js
│   └── stringUtils.js
├── uploads/              # Uploaded files directory
├── index.js              # Express app setup
├── server.js             # Server entry point
└── package.json
```

## Authentication

The API uses JWT (JSON Web Tokens) for authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

## Testing

Run tests with:
```bash
npm test
```

## Environment Variables

See the `.env` example above for all required environment variables. Make sure to:
- Set strong secrets for JWT and session
- Configure your database credentials
- Set up Google OAuth credentials if using Google login
- Configure email service for password reset functionality

## Database Migrations

Database migrations are located in the `migrations/` directory. The application uses Sequelize for database management and will automatically sync the schema on startup (in development mode).

## Security Features

- Password hashing with bcryptjs
- JWT token-based authentication
- Input validation and sanitization
- CORS configuration
- Role-based access control
- Secure session management

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

ISC

## Author

Nguyễn Huyền

## Support

For issues and questions, please open an issue on the GitHub repository.

