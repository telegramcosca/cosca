require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;

const app = express();
app.use(express.json());
const server = http.createServer(app);
const io = new Server(server);

// 1. MongoDB Database Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected Successfully!'))
  .catch(err => console.log('MongoDB Error:', err));

// 2. User Schema
const userSchema = new mongoose.Schema({
    googleId: String,
    githubId: String,
    displayName: String,
    email: String,
    photo: String
});
const User = mongoose.model('User', userSchema);

// 3. Session Setup
app.use(session({
    secret: process.env.SESSION_SECRET || 'casca_secret',
    resave: false,
    saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    const user = await User.findById(id);
    done(null, user);
});

// 4. Google Login Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "https://cosca-production-ec29.up.railway.app/auth/google/callback"
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ googleId: profile.id });
        if (!user) {
            user = await User.create({
                googleId: profile.id,
                displayName: profile.displayName,
                email: profile.emails ? profile.emails[0].value : '',
                photo: profile.photos ? profile.photos[0].value : ''
            });
        }
        return done(null, user);
    } catch (err) {
        return done(err, null);
    }
  }
));

// 5. GitHub Login Strategy
passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: "https://cosca-production-ec29.up.railway.app/auth/github/callback"
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ githubId: profile.id });
        if (!user) {
            user = await User.create({
                githubId: profile.id,
                displayName: profile.displayName || profile.username || "GitHub User",
                email: profile.emails ? profile.emails[0].value : '',
                photo: profile.photos ? profile.photos[0].value : ''
            });
        }
        return done(null, user);
    } catch (err) {
        return done(err, null);
    }
  }
));
// ==========================================
// EMAIL & OTP ROUTES
// ==========================================
// Email bhejne ka setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

// Route 1: OTP Send karna
app.post('/api/send-otp', async (req, res) => {
    const { email } = req.body;
    // 6 digit ka random OTP banayein
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); 
    const otpExpires = Date.now() + 5 * 60 * 1000; // 5 minute ke liye valid

    try {
        let user = await User.findOne({ email });
        // Agar user nahi hai toh naya banayein, hai toh purana update karein
        if (!user) {
            user = await User.create({ email, otp, otpExpires });
        } else {
            user.otp = otp; 
            user.otpExpires = otpExpires; 
            await user.save();
        }

        // Email bhejein
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Casca - Verification Code',
            text: `Your Casca OTP code is: ${otp}. It is valid for 5 minutes.`
        });
        res.json({ success: true, message: 'OTP sent!' });
    } catch (err) {
        console.log("Email Error:", err);
        res.json({ success: false, message: 'Failed to send OTP' });
    }
});

// Route 2: OTP Verify karke Password banana (Naye users ke liye)
app.post('/api/verify-otp', async (req, res) => {
    const { email, otp, password } = req.body;
    try {
        const user = await User.findOne({ email });
        // OTP galat hai ya expire ho gaya
        if (!user || user.otp !== otp || user.otpExpires < Date.now()) {
            return res.json({ success: false, message: 'Invalid or Expired OTP' });
        }

        // Password ko encrypt (hash) karke save karein
        user.password = await bcrypt.hash(password, 10);
        user.otp = undefined; // OTP ka kaam khatam
        user.otpExpires = undefined;
        await user.save();

        // Account banne ke baad direct login karwa dein
        req.login(user, (err) => {
            if(err) return res.json({ success: false });
            res.json({ success: true, message: 'Account created!' });
        });
    } catch (err) {
        res.json({ success: false, message: 'Error verifying OTP' });
    }
});

// Route 3: Direct Email/Password se Login (Purane users ke liye)
app.post('/api/sign-in', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user || !user.password) {
            return res.json({ success: false, message: 'Account not found. Please sign up.' });
        }
        
        // Password check karein
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.json({ success: false, message: 'Wrong password' });
        }
        
        // Sahi hone par login
        req.login(user, (err) => {
            if(err) return res.json({ success: false });
            res.json({ success: true, message: 'Logged in!' });
        });
    } catch (err) {
        res.json({ success: false, message: 'Login Error' });
    }
});

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

// Google Routes
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => res.redirect('/')
);

// GitHub Routes
app.get('/auth/github', passport.authenticate('github', { scope: [ 'user:email' ] }));
app.get('/auth/github/callback', 
  passport.authenticate('github', { failureRedirect: '/' }),
  (req, res) => res.redirect('/')
);

// Logout Route
app.get('/logout', (req, res) => {
    req.logout((err) => {
        res.redirect('/');
    });
});

// Check Current User API
app.get('/api/current_user', (req, res) => {
    res.send(req.user);
});

// ==========================================
// FRONTEND AND SOCKET.IO
// ==========================================
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
    socket.on('send_message', (msg) => {
        io.emit('receive_message', msg);
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Casca Server running on port ${PORT}`);
});
