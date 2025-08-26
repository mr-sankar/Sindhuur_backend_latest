// middleware/auth.js
const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.JWT_SECRET || 'your-secret-key';

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;
  console.log('Auth middleware - header:', authHeader); // Debug
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('Auth middleware - No token provided or invalid format');
    return res.status(401).json({ message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  console.log('Auth middleware - token:', token); // Debug
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    console.log('Auth middleware - decoded:', decoded); // Debug
    if (!decoded.role || !['admin', 'moderator'].includes(decoded.role)) {
      console.log('Auth middleware - Insufficient permissions:', decoded.role);
      return res.status(401).json({ message: 'Insufficient permissions' });
    }
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Auth middleware - token verification error:', error.message);
    return res.status(401).json({ message: 'Invalid token' });
  }
};