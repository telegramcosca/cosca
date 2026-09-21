require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;

const app = express();
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
