require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 1. MongoDB Database Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected Successfully!'))
  .catch(err => console.log('MongoDB Error:', err));

// 2. User Schema (Database me user ka data kaise save hoga)
const userSchema = new mongoose.Schema({
  googleId: String,
  displayName: String,
  email: String,
  photo: String
});
const User = mongoose.model('User', userSchema);

// 3. Session Setup (User ka login yaad rakhne ke liye)
app.use(session({
  secret: process.env.SESSION_SECRET,
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
      // Check karo agar user pehle se hai
      let user = await User.findOne({ googleId: profile.id });
      if (!user) {
        // Agar naya user hai toh database me save karo
        user = await User.create({
          googleId: profile.id,
          displayName: profile.displayName,
          email: profile.emails[0].value,
          photo: profile.photos[0].value
        });
      }
      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }
));

const GitHubStrategy = require('passport-github2').Strategy;

passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: "https://cosca-production-ec29.up.railway.app/auth/github/callback"
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
        // Find existing user or create a new one
        let user = await User.findOne({ githubId: profile.id });
        
        if (!user) {
            user = await User.create({
                githubId: profile.id,
                // GitHub kabhi-kabhi displayName nahi deta, toh username use karenge
                displayName: profile.displayName || profile.username || "GitHub User",
                // Agar aapke database mein email required hai, toh add karein:
                // email: profile.emails ? profile.emails[0].value : ""
            });
        }
        return done(null, user);
    } catch (err) {
        return done(err, null);
    }
  }
));

// GitHub Auth Routes (Inhe baki routes jahan app.get hain, wahan paste karein)
app.get('/auth/github',
  passport.authenticate('github', { scope: [ 'user:email' ] }));

app.get('/auth/github/callback', 
  passport.authenticate('github', { failureRedirect: '/' }),
  (req, res) => {
    // Login successful hone par home page par bhej dein
    res.redirect('/');
  });

// 5. Authentication Routes (Login URLs)
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    res.redirect('/'); // Login hone ke baad chat par wapas bhej do
  }
);

app.get('/logout', (req, res) => {
  req.logout((err) => {
    res.redirect('/');
  });
});

// API jo frontend ko batayegi ki kaun login hai
app.get('/api/current_user', (req, res) => {
  res.send(req.user); // Agar login nahi hai toh khali bhejega
});

// 6. Frontend Server aur Socket.io (Chat System)
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
